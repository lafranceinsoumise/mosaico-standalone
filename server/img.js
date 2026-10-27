import path from "node:path";

import sharp from "sharp";

const MAX_SIZE = 2400;
const ALLOWED_ROOTS = ["uploads", "templates"].map((dir) => path.resolve(dir));

function parseSize(value) {
  if (value === undefined || value === "null" || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_SIZE ? n : NaN;
}

function localPath(src) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(src, "http://localhost").pathname);
  } catch (e) {
    return null;
  }

  const file = path.resolve("." + path.posix.normalize(pathname));
  return ALLOWED_ROOTS.some((root) => file.startsWith(root + path.sep))
    ? file
    : null;
}

function placeholder(width, height) {
  const size = 40;
  let stripes = "";
  for (let y = 0; y < height; y += size * 2) {
    for (let x = 0; x <= width; x += size * 2) {
      stripes +=
        `<polygon points="${x},${y} ${x + size},${y} ${x + size * 2},${y + size} ${x + size * 2},${y + size * 2}"/>` +
        `<polygon points="${x},${y + size} ${x + size},${y + size * 2} ${x},${y + size * 2}"/>`;
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="100%" height="100%" fill="#707070"/>` +
      `<g fill="#808080">${stripes}</g>` +
      `<text x="50%" y="50%" fill="#B0B0B0" font-family="sans-serif" font-size="20" text-anchor="middle" dominant-baseline="middle">${width} x ${height}</text>` +
      `</svg>`,
  );
}

/*
 * GET with src, method and params query values
 * method can be "placeholder", "cover" or "resize"
 * "placeholder" will return a placeholder image with the given width/height
 * (encoded in params as "width,height")
 * "cover" will resize the image keeping the aspect ratio and covering the whole
 * dimension (cutting it if different A/R)
 * "resize" can receive one dimension to resize while keeping the A/R, or 2 to
 * resize the image to be inside the dimensions.
 * Only images stored locally in uploads/ or templates/ can be processed.
 */
export default async (req, res) => {
  const { method, src, params } = req.query;
  if (typeof params !== "string") return res.sendStatus(400);

  const [width, height] = params.split(",").map(parseSize);
  if (Number.isNaN(width) || Number.isNaN(height)) return res.sendStatus(400);

  let image;

  if (method === "placeholder") {
    if (!width || !height) return res.sendStatus(400);
    image = sharp(placeholder(width, height)).png();
  } else if (method === "resize" || method === "cover") {
    const file = typeof src === "string" && localPath(src);
    if (!file) return res.sendStatus(400);
    if (method === "cover" ? !width || !height : !width && !height) {
      return res.sendStatus(400);
    }

    image = sharp(file, { animated: true })
      .autoOrient()
      .resize(width, height, {
        fit: method === "cover" ? "cover" : "inside",
      });
  } else {
    return res.sendStatus(400);
  }

  let output;
  try {
    output = await image.toBuffer({ resolveWithObject: true });
  } catch (e) {
    return res.sendStatus(404);
  }

  res.set("Cache-Control", "public, max-age=86400");
  res.type(output.info.format);
  res.send(output.data);
};
