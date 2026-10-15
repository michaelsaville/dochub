// Composite HEVC tile PNGs row-major, crop to the grid's real size, rotate, write JPEG.
const fs = require("fs")
const sharp = require(process.env.SHARP_PATH || "sharp")
;(async () => {
  const s = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  const metas = await Promise.all(s.pngs.map((p) => sharp(p).metadata()))
  const tw = metas[0].width, th = metas[0].height, rows = Math.ceil(s.pngs.length / s.cols)
  const canvas = sharp({ create: { width: tw * s.cols, height: th * rows, channels: 3, background: "#000" } })
    .composite(s.pngs.map((p, i) => ({ input: p, left: (i % s.cols) * tw, top: Math.floor(i / s.cols) * th })))
  let buf = await canvas.png().toBuffer()
  let img = sharp(buf).extract({ left: 0, top: 0, width: s.W || tw, height: s.H || th })
  buf = await img.png().toBuffer()
  img = sharp(buf)
  if (s.rot) img = img.rotate(360 - s.rot) // irot is anti-clockwise
  await img.resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(s.out)
})().catch((e) => { console.error(e); process.exit(1) })
