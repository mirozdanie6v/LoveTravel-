import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname);
const src=resolve(root,'src');
const dist=resolve(root,'dist');
const v2=resolve(dist,'v2');

await rm(dist,{recursive:true,force:true});
await mkdir(v2,{recursive:true});

for(const file of ['index.html','client-v2.css','client-v2.js','client-v2-model.js']){
  await copyFile(resolve(src,file),resolve(v2,file));
}

console.log('Built isolated LoveTravel Client v2 preview with shared domain view model.');
