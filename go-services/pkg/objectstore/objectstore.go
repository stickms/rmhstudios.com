// go-services/pkg/objectstore/objectstore.go
//
// objectstore is the Go analog of the TS lib/storage/s3.server.ts seam: a thin,
// range-aware reader over an S3-compatible bucket (MinIO now, R2 later). It is
// the ONLY place in go-services that imports the AWS SDK.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// ErrNotFound is returned by Get when the key does not exist.
var ErrNotFound = errors.New("objectstore: not found")

// ErrRangeNotSatisfiable is returned when the requested Range cannot be served.
var ErrRangeNotSatisfiable = errors.New("objectstore: range not satisfiable")

// ErrNotModified is returned when a conditional Get matched (S3 answered 304).
var ErrNotModified = errors.New("objectstore: not modified")

// NotModifiedError is the concrete error behind ErrNotModified. It carries the
// validators the bucket sent on its 304 so a caller can relay them; either may
// be empty if the upstream sent none. errors.Is(err, ErrNotModified) holds.
type NotModifiedError struct {
	ETag         string
	LastModified string
}

func (e *NotModifiedError) Error() string        { return ErrNotModified.Error() }
func (e *NotModifiedError) Is(target error) bool { return target == ErrNotModified }

// GetOptions are the optional request headers relayed to the bucket.
type GetOptions struct {
	Range           string // "bytes=0-1023"
	IfNoneMatch     string // an ETag, as the client sent it
	IfModifiedSince string // an HTTP date, as the client sent it
}

// Object is a streamable object plus the metadata needed to relay it to a client.
type Object struct {
	Body            io.ReadCloser
	ContentType     string
	ContentEncoding string // e.g. "gzip" — library PDFs are stored gzip-compressed
	ContentLength   int64
	ContentRange    string // set on a 206 partial response
	ETag            string
	LastModified    string
	Status          int // 200 or 206
}

type config struct {
	endpoint, region, accessKey, secretKey, bucket string
	forcePathStyle                                 bool
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() (config, error) {
	c := config{
		endpoint:       os.Getenv("S3_ENDPOINT"),
		region:         envOr("S3_REGION", "us-east-1"),
		accessKey:      os.Getenv("S3_ACCESS_KEY_ID"),
		secretKey:      os.Getenv("S3_SECRET_ACCESS_KEY"),
		bucket:         os.Getenv("S3_BUCKET"),
		forcePathStyle: os.Getenv("S3_FORCE_PATH_STYLE") != "false",
	}
	if c.bucket == "" {
		return config{}, errors.New("objectstore: S3_BUCKET is required")
	}
	if c.endpoint == "" {
		return config{}, errors.New("objectstore: S3_ENDPOINT is required")
	}
	return c, nil
}

// S3 reads objects from an S3-compatible bucket.
type S3 struct {
	client *s3.Client
	bucket string
}

// New builds an S3 reader from the S3_* environment.
func New(ctx context.Context) (*S3, error) {
	c, err := loadConfig()
	if err != nil {
		return nil, err
	}
	awsConf, err := awscfg.LoadDefaultConfig(ctx,
		awscfg.WithRegion(c.region),
		awscfg.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(c.accessKey, c.secretKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("objectstore: aws config: %w", err)
	}
	client := s3.NewFromConfig(awsConf, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(c.endpoint)
		o.UsePathStyle = c.forcePathStyle
	})
	return &S3{client: client, bucket: c.bucket}, nil
}

// Get streams the object at key. opts.Range is forwarded to S3 and a 206
// partial may be returned; opts.IfNoneMatch/IfModifiedSince make it a
// conditional GET that yields ErrNotModified instead of the body. Missing keys yield ErrNotFound; an
// unsatisfiable range yields ErrRangeNotSatisfiable.
func (s *S3) Get(ctx context.Context, key string, opts GetOptions) (*Object, error) {
	in := &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}
	if opts.Range != "" {
		in.Range = aws.String(opts.Range)
	}
	if opts.IfNoneMatch != "" {
		in.IfNoneMatch = aws.String(opts.IfNoneMatch)
	}
	if opts.IfModifiedSince != "" {
		if t, perr := http.ParseTime(opts.IfModifiedSince); perr == nil {
			in.IfModifiedSince = aws.Time(t)
		}
	}
	out, err := s.client.GetObject(ctx, in)
	if err != nil {
		var statusErr interface{ HTTPStatusCode() int }
		if errors.As(err, &statusErr) && statusErr.HTTPStatusCode() == http.StatusNotModified {
			nm := &NotModifiedError{}
			var re *smithyhttp.ResponseError
			if errors.As(err, &re) && re.Response != nil && re.Response.Response != nil {
				nm.ETag = re.Response.Header.Get("ETag")
				nm.LastModified = re.Response.Header.Get("Last-Modified")
			}
			return nil, nm
		}
		var nsk *types.NoSuchKey
		if errors.As(err, &nsk) {
			return nil, ErrNotFound
		}
		var apiErr interface{ ErrorCode() string }
		if errors.As(err, &apiErr) {
			switch apiErr.ErrorCode() {
			case "NoSuchKey", "NotFound":
				return nil, ErrNotFound
			case "InvalidRange":
				return nil, ErrRangeNotSatisfiable
			}
		}
		return nil, fmt.Errorf("objectstore: get %q: %w", key, err)
	}
	obj := &Object{
		Body:   out.Body,
		Status: http.StatusOK,
	}
	if out.ContentType != nil {
		obj.ContentType = *out.ContentType
	}
	if out.ContentEncoding != nil {
		obj.ContentEncoding = *out.ContentEncoding
	}
	if out.ContentLength != nil {
		obj.ContentLength = *out.ContentLength
	}
	if out.ETag != nil {
		obj.ETag = *out.ETag
	}
	if out.LastModified != nil {
		obj.LastModified = out.LastModified.UTC().Format(http.TimeFormat)
	}
	if out.ContentRange != nil {
		obj.ContentRange = *out.ContentRange
		obj.Status = http.StatusPartialContent
	}
	return obj, nil
}
