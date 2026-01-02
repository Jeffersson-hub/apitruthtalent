// src/types/shims.d.ts
declare module "fuse.js" {
  const Fuse: any;
  export default Fuse;
}

declare module "chrono-node" {
  const chrono: any;
  export = chrono;
}