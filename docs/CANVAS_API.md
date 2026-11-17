# MGU canvas drawing API (the contract the app and the emulator share)

The app's `drawHome(c, state, t)` receives a canvas handle `c` with these methods
(the real MGU kit, `cauliflowermossgrape/idrive7-apps` kit/runtime, provides them;
the emulator implements the same surface over an HTML5 canvas):

- c.w, c.h                               logical screen size (default 1920x720; short screens shrink)
- c.clear(color)
- c.fillRect(x,y,w,h,color)
- c.gradientRect(x,y,w,h,from,to[,vertical])
- c.roundRect(x,y,w,h,r,color)
- c.strokeRoundRect(x,y,w,h,r,lineWidth,color)
- c.line(x1,y1,x2,y2,lineWidth,color)
- c.circle(cx,cy,radius,color)
- c.quad([[x,y]...],color)
- c.image(img,x,y,w,h)                   (optional; may be absent)
- c.text(str,x,y,size,color,opts)        opts: {align:'left|center|right', font:'airplay', literal:bool}
- c.textWidth(str,size,opts) -> px       (optional)
- c.target(x,y,w,h,onClick,id,radius)    register a touch/click hit-rect (optional)

Lifecycle (kit/mgu.js): `mgu.run({ start(ctx) })`; ctx has ui.onClick(BTN,fn),
display, dataDir, log. Hardware buttons come from app.json `screens[].buttons`.

State object the view renders (driven by the backend; the emulator fakes it):
  phase: 'idle'|'waiting'|'audio'|'mirror'|'video'|'loading'|'error'|'stopping'
  pin:   '123456' | ''        AirPlay pairing code to show
  connected: bool
  mode: 'audio'|'hls'|'mirror'|'waiting'|null
  music: { title, artist, album, playbackState, controls:{...}, shuffle, repeat }
  error: 'certificate'|'certificate_untrusted'|'offline'|'dns'|'forbidden'|'not_found'|'unsupported'|'decode'|'media_failed'
  reason: human string (optional, extra detail)
