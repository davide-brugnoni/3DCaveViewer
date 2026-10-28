// L'encoder Draco è WASM a 32 bit: una singola primitive con troppe decine di
// milioni di vertici ne esaurisce la memoria e fa fallire la scrittura del GLB.
// Questo modulo suddivide le primitive oltre soglia in più primitive dello
// stesso materiale, che Three.js carica in modo del tutto trasparente.

// Default calibrato empiricamente: l'encoder abortisce intorno ai 10M di
// vertici indicizzati (~20M triangoli) e regge 5M con 3 attributi; 4M lascia
// margine per mesh con più attributi.
export const MAX_DRACO_VERTS =
  Math.max(100_000, parseInt(process.env.DRACO_MAX_VERTS) || 4_000_000);

const TRIANGLES = 4;

export function splitLargePrimitives(document, maxVerts = MAX_DRACO_VERTS) {
  let splitCount = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos || pos.getCount() <= maxVerts) continue;
      const mode = prim.getMode();
      if (mode !== TRIANGLES && mode !== undefined && mode !== null) continue;

      if (prim.getIndices()) splitIndexed(document, mesh, prim, maxVerts);
      else                   splitNonIndexed(document, mesh, prim, maxVerts);
      splitCount++;
    }
  }
  return splitCount;
}

function getBuffer(doc) {
  return doc.getRoot().listBuffers()[0] || doc.createBuffer();
}

function clonePrimitiveShell(doc, prim) {
  const np = doc.createPrimitive().setMode(prim.getMode());
  const material = prim.getMaterial();
  if (material) np.setMaterial(material);
  return np;
}

// Rimuove la primitive originale e libera gli accessor che non sono
// referenziati da altre primitive (i loro array giganti tornano al GC).
function disposePrimitive(mesh, prim) {
  const attrs   = prim.listAttributes();
  const indices = prim.getIndices();
  mesh.removePrimitive(prim);
  prim.dispose();
  for (const a of attrs) {
    if (a.listParents().every((p) => p.propertyType === 'Root')) a.dispose();
  }
  if (indices && indices.listParents().every((p) => p.propertyType === 'Root'))
    indices.dispose();
}

// Primitive non indicizzata (triangle soup): basta affettare gli attributi in
// blocchi con un numero di vertici multiplo di 3.
function splitNonIndexed(doc, mesh, prim, maxVerts) {
  const total      = prim.getAttribute('POSITION').getCount();
  const chunkVerts = Math.max(3, Math.floor(maxVerts / 3) * 3);
  const semantics  = prim.listSemantics();
  const attrs      = semantics.map((s) => prim.getAttribute(s));
  const buffer     = getBuffer(doc);

  for (let start = 0; start < total; start += chunkVerts) {
    const count = Math.min(chunkVerts, total - start);
    const np = clonePrimitiveShell(doc, prim);
    for (let i = 0; i < semantics.length; i++) {
      const a  = attrs[i];
      const es = a.getElementSize();
      const acc = doc.createAccessor()
        .setType(a.getType())
        .setNormalized(a.getNormalized())
        .setArray(a.getArray().slice(start * es, (start + count) * es))
        .setBuffer(buffer);
      np.setAttribute(semantics[i], acc);
    }
    mesh.addPrimitive(np);
  }

  disposePrimitive(mesh, prim);
}

// Primitive indicizzata: raggruppa i triangoli in blocchi con al più maxVerts
// vertici unici, raccogliendo (gather) i soli vertici usati da ogni blocco e
// rimappando gli indici. La tabella di remap usa un tag di generazione per
// evitare di azzerarla a ogni blocco.
function splitIndexed(doc, mesh, prim, maxVerts) {
  const idxArr    = prim.getIndices().getArray();
  const triCount  = Math.floor(idxArr.length / 3);
  const vertCount = prim.getAttribute('POSITION').getCount();
  const semantics = prim.listSemantics();
  const attrs     = semantics.map((s) => prim.getAttribute(s));
  const srcArrays = attrs.map((a) => a.getArray());
  const elemSizes = attrs.map((a) => a.getElementSize());
  const buffer    = getBuffer(doc);

  const remapId  = new Uint32Array(vertCount);
  const remapGen = new Uint32Array(vertCount);
  const order    = new Uint32Array(Math.min(maxVerts, vertCount));
  let gen = 0;

  let t = 0;
  while (t < triCount) {
    gen++;
    const startT = t;
    let unique = 0;

    while (t < triCount) {
      // Stima conservativa: un triangolo aggiunge al più 3 vertici nuovi.
      if (unique + 3 > maxVerts && unique > 0) break;
      for (let k = 0; k < 3; k++) {
        const v = idxArr[t * 3 + k];
        if (remapGen[v] !== gen) {
          remapGen[v] = gen;
          remapId[v]  = unique;
          order[unique++] = v;
        }
      }
      t++;
    }

    const chunkTris = t - startT;
    const newIdx = new Uint32Array(chunkTris * 3);
    for (let i = 0; i < chunkTris * 3; i++)
      newIdx[i] = remapId[idxArr[startT * 3 + i]];

    const np = clonePrimitiveShell(doc, prim);
    for (let i = 0; i < semantics.length; i++) {
      const es  = elemSizes[i];
      const src = srcArrays[i];
      const dst = new src.constructor(unique * es);
      for (let j = 0; j < unique; j++) {
        const so = order[j] * es, do_ = j * es;
        for (let k = 0; k < es; k++) dst[do_ + k] = src[so + k];
      }
      const acc = doc.createAccessor()
        .setType(attrs[i].getType())
        .setNormalized(attrs[i].getNormalized())
        .setArray(dst)
        .setBuffer(buffer);
      np.setAttribute(semantics[i], acc);
    }
    np.setIndices(doc.createAccessor()
      .setType('SCALAR')
      .setArray(newIdx)
      .setBuffer(buffer));

    mesh.addPrimitive(np);
  }

  disposePrimitive(mesh, prim);
}
