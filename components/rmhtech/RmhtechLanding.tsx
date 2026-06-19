/**
 * RMHTech — biotech-arm landing page.
 *
 * Monochrome, minimal, single-screen hero over an animated WebGL liquid-gradient
 * background (original fbm domain-warp shader), with a liquid-metal CTA.
 * All styles are scoped under `.rmht` in rmhtech.css so nothing leaks into the
 * rest of the site. The shader and scroll reveals run client-side only.
 */

import { useEffect, useRef } from 'react'

const ACCESS_MAILTO =
  'mailto:info@rmhstudios.com?subject=Request%20access%20%E2%80%94%20rmhtech&body=Hi%20rmhtech%20team%2C%0D%0A%0D%0AI%27d%20like%20early%20access%20to%20the%20Co-Scientist.%0D%0A%0D%0AName%3A%0D%0AInstitution%20%2F%20company%3A%0D%0ARole%3A%0D%0AWhat%20I%27d%20use%20it%20for%3A%0D%0A'

export default function RmhtechLanding() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* scroll reveals for the pillars */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const pillars = Array.from(root.querySelectorAll<HTMLElement>('.pillar'))
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.25 },
    )
    pillars.forEach((p, i) => {
      p.style.transitionDelay = `${i * 0.08}s`
      io.observe(p)
    })
    return () => io.disconnect()
  }, [])

  /* animated liquid-gradient background — original WebGL fbm domain-warp */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const gl = (cv.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false }) ||
      cv.getContext('experimental-webgl', { antialias: false, alpha: true })) as WebGLRenderingContext | null
    if (!gl) {
      if (rootRef.current)
        rootRef.current.style.background =
          'radial-gradient(120% 90% at 50% 30%, #1a1a1a 0%, #080808 60%)'
      return
    }

    const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'
    const FRAG = [
      'precision highp float;',
      'uniform vec2 u_res;uniform float u_t;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
      ' return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}',
      'float fbm(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
      ' for(int i=0;i<6;i++){v+=a*n(p);p=m*p;a*=0.5;}return v;}',
      'void main(){',
      ' vec2 uv=gl_FragCoord.xy/u_res.xy;',
      ' vec2 p=uv;p.x*=u_res.x/u_res.y;',
      ' float t=u_t*0.04;',
      ' vec2 q=vec2(fbm(p*1.3+vec2(0.0,t)),fbm(p*1.3+vec2(5.2,-t)));',
      ' vec2 r=vec2(fbm(p*1.3+q*1.9+vec2(1.7,9.2)+t*0.5),fbm(p*1.3+q*1.9+vec2(8.3,2.8)-t*0.5));',
      ' float f=fbm(p*1.5+r*2.3);',
      ' float lo=smoothstep(0.28,0.98,f+r.x*0.5);',
      ' float hi=smoothstep(0.58,1.08,r.y*0.9+f*0.4);',
      ' vec3 base=vec3(0.027);',
      ' vec3 gMid=vec3(0.34,0.345,0.35);',
      ' vec3 gLight=vec3(0.72,0.725,0.73);',
      ' vec3 gWhite=vec3(0.93);',
      ' vec3 col=base;',
      ' col=mix(col,gMid,lo*0.55);',
      ' col=mix(col,gLight,pow(lo,2.3)*0.42);',
      ' col=mix(col,gWhite,pow(hi,2.7)*0.18);',
      ' float vig=smoothstep(1.35,0.10,length(uv-vec2(0.5)));',
      ' col*=0.40+0.42*vig;',
      ' float band=smoothstep(0.0,0.42,abs(uv.y-0.46));',
      ' col*=mix(0.66,1.0,band);',
      ' gl_FragColor=vec4(col,1.0);',
      '}',
    ].join('\n')

    const sh = (type: number, src: string) => {
      const o = gl.createShader(type)
      if (!o) return null
      gl.shaderSource(o, src)
      gl.compileShader(o)
      return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null
    }
    const vs = sh(gl.VERTEX_SHADER, VERT)
    const fs = sh(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const pr = gl.createProgram()
    if (!pr) return
    gl.attachShader(pr, vs)
    gl.attachShader(pr, fs)
    gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return
    gl.useProgram(pr)

    const bf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, bf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const lc = gl.getAttribLocation(pr, 'p')
    gl.enableVertexAttribArray(lc)
    gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(pr, 'u_res')
    const uT = gl.getUniformLocation(pr, 'u_t')

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr)
      const hh = Math.floor(window.innerHeight * dpr)
      if (cv.width !== w || cv.height !== hh) {
        cv.width = w
        cv.height = hh
      }
      gl.viewport(0, 0, cv.width, cv.height)
      gl.uniform2f(uRes, cv.width, cv.height)
    }
    window.addEventListener('resize', resize, { passive: true })
    resize()

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    let raf = 0
    let running = false
    const start = performance.now()
    const frame = (now: number) => {
      gl.uniform1f(uT, (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    const play = () => {
      if (running || reduce) return
      running = true
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    requestAnimationFrame(() => cv.classList.add('on'))
    if (reduce) {
      gl.uniform1f(uT, 8.0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    } else {
      play()
    }
    const onVis = () => (document.hidden ? stop() : play())
    document.addEventListener('visibilitychange', onVis)

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    }
  }, [])

  return (
    <div className="rmht" ref={rootRef}>
      <canvas className="liquid" ref={canvasRef} aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="layer">
        <header>
          <div className="wrap bar">
            <a className="mark" href="#top" aria-label="rmhtech home">
              <span className="dot" aria-hidden="true" />
              rmhtech
            </a>
            <a className="req" href={ACCESS_MAILTO}>
              Request access
            </a>
          </div>
        </header>

        <main id="top">
          <section className="hero">
            <div className="wrap">
              <p className="eyebrow">Reproducible by construction</p>
              <h1>
                An AI co-scientist you can <em>trust</em>.
              </h1>
              <p className="sub">
                Point it at your data — or just an accession ID — and get back a publication-ready
                analysis where every step is versioned, traceable, and re-runnable forever.
              </p>
              <a className="metal" id="access" href={ACCESS_MAILTO} aria-label="Request access by email">
                <span>Request access</span>
              </a>
            </div>
            <div className="scrollcue" aria-hidden="true">
              <span>Scroll</span>
              <span className="ln" />
            </div>
          </section>

          <section className="essence wrap" aria-label="The platform">
            <div className="pillar">
              <div>
                <div className="name">Co-Scientist</div>
                <div className="meta">01 — The agent</div>
              </div>
              <p className="desc">
                Reads your intent, plans the analysis, runs the tools, interprets the results, and
                drafts the methods. It shows its work. Correctness over autonomy — a
                plausible-but-wrong figure is worse than no figure at all.
              </p>
            </div>
            <div className="pillar">
              <div>
                <div className="name">Ledger</div>
                <div className="meta">02 — The substrate</div>
              </div>
              <p className="desc">
                Every artifact is content-addressed, versioned, and re-runnable by identifier. Each
                figure carries its own address — click it to see the exact parameters, or re-run it
                on different infrastructure, years later.
              </p>
            </div>
            <div className="pillar">
              <div>
                <div className="name">Fleet</div>
                <div className="meta">03 — The compute</div>
              </div>
              <p className="desc">
                Kubernetes, Helm, and Terraform driving a Go worker fleet that executes pipelines at
                institutional scale, with hard multi-tenant isolation. The substrate that turns a
                three-month core-queue into an afternoon.
              </p>
            </div>
          </section>

          <section className="close wrap">
            <p>
              The agent lands the customer. The <span className="k">substrate</span> keeps them.
            </p>
          </section>
        </main>

        <footer>
          <div className="wrap foot-grid">
            <div className="foot-brand">
              <a className="mark" href="#top" aria-label="rmhtech home">
                <span className="dot" aria-hidden="true" />
                rmhtech
              </a>
              <p className="tag">Building the trustworthy substrate for AI-driven biology.</p>
            </div>
            <nav className="col" aria-label="Contact">
              <h4>Contact</h4>
              <a href="mailto:info@rmhstudios.com">info@rmhstudios.com</a>
            </nav>
            <nav className="col" aria-label="Careers">
              <h4>Careers</h4>
              <a href="mailto:careers@rmhstudios.com?subject=Careers%20%E2%80%94%20rmhtech">
                careers@rmhstudios.com
              </a>
              <span className="hiring">We&rsquo;re hiring</span>
              <p className="note">Hiring founding engineers.</p>
            </nav>
            <nav className="col" aria-label="Access">
              <h4>Access</h4>
              <a href={ACCESS_MAILTO}>Request access</a>
            </nav>
          </div>
          <div className="wrap foot-base">
            <span>© 2026 rmhtech</span>
            <span>A deeptech venture from RMH Studios</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
