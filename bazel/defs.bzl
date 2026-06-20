"""Reusable container-image rules for the Go service fleet."""

load("@aspect_bazel_lib//lib:transitions.bzl", "platform_transition_filegroup")
load("@rules_oci//oci:defs.bzl", "oci_image", "oci_load", "oci_push")
load("@rules_pkg//pkg:tar.bzl", "pkg_tar")

def go_service_image(
        name,
        binary,
        base = "@distroless_base",
        registry_repo = None,
        platform = "@rules_go//go/toolchain:linux_arm64",
        env = None):
    """Build a per-service OCI image from a go_binary.

    Generates `<name>_image`, `<name>_load`, and (if registry_repo) `<name>_push`.

    Args:
      name: service name (e.g. "gateway"). Drives the local repo tag
        `rmhstudios-go-<name>:dev`.
      binary: label of the go_binary (e.g. "//go-services/cmd/gateway:gateway").
      base: base OCI image label.
      registry_repo: default push repository. Defaults to
        "ghcr.io/rmhstudios/rmhstudios-go-<name>"; override at run time with
        `bazel run //...:<name>_push -- --repository=<repo> --tag=<tag>`.
      platform: target platform the binary is compiled for inside the image.
      env: optional dict of image environment variables.
    """
    bin_name = binary.rsplit(":", 1)[-1]

    # Force the binary to the Linux container platform regardless of host.
    platform_transition_filegroup(
        name = name + "_linux_bin",
        srcs = [binary],
        target_platform = platform,
    )

    pkg_tar(
        name = name + "_layer",
        srcs = [":" + name + "_linux_bin"],
        package_dir = "/usr/local/bin",
    )

    oci_image(
        name = name + "_image",
        base = base,
        tars = [":" + name + "_layer"],
        entrypoint = ["/usr/local/bin/" + bin_name],
        env = env or {},
    )

    oci_load(
        name = name + "_load",
        image = ":" + name + "_image",
        repo_tags = ["rmhstudios-go-" + name + ":dev"],
    )

    oci_push(
        name = name + "_push",
        image = ":" + name + "_image",
        repository = registry_repo or ("ghcr.io/rmhstudios/rmhstudios-go-" + name),
    )
