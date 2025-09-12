export function waybackUrlFor(originalUrl: string, timestamp: string): string {
  // Choose Wayback content modifiers based on extension for best fidelity
  const ext = originalUrl.split("?")[0].split("#")[0].toLowerCase();
  let mod = "id_"; // identity
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|tif|tiff)$/.test(ext)) mod = "im_";
  else if (/\.css$/.test(ext)) mod = "cs_";
  else if (/\.js$/.test(ext)) mod = "js_";
  return `https://web.archive.org/web/${timestamp}${mod}/${originalUrl}`;
}
