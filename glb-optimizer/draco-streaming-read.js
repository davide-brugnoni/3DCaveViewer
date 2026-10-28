// Variante di KHRDracoMeshCompression con lettura a memoria costante.
//
// La preread() originale di @gltf-transform/extensions decodifica TUTTE le
// mesh Draco del file e le tiene vive nel WASM (32 bit) fino alla fine: su
// GLB con decine di milioni di vertici totali il modulo abortisce con
// "RuntimeError: Aborted()". Qui ogni bufferView viene decodificato, copiato
// negli accessor e distrutto subito, così il picco di memoria WASM dipende
// dalla primitive più grande e non dalla somma di tutte.
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { Accessor, BufferUtils, GLB_BUFFER } from '@gltf-transform/core';

function componentArray(componentType) {
  return {
    [Accessor.ComponentType.FLOAT]:          Float32Array,
    [Accessor.ComponentType.UNSIGNED_INT]:   Uint32Array,
    [Accessor.ComponentType.UNSIGNED_SHORT]: Uint16Array,
    [Accessor.ComponentType.UNSIGNED_BYTE]:  Uint8Array,
    [Accessor.ComponentType.SHORT]:          Int16Array,
    [Accessor.ComponentType.BYTE]:           Int8Array,
  }[componentType];
}

function dataType(m, componentType) {
  return {
    [Accessor.ComponentType.FLOAT]:          m.DT_FLOAT32,
    [Accessor.ComponentType.UNSIGNED_INT]:   m.DT_UINT32,
    [Accessor.ComponentType.UNSIGNED_SHORT]: m.DT_UINT16,
    [Accessor.ComponentType.UNSIGNED_BYTE]:  m.DT_UINT8,
    [Accessor.ComponentType.SHORT]:          m.DT_INT16,
    [Accessor.ComponentType.BYTE]:           m.DT_INT8,
  }[componentType];
}

function decodeGeometry(m, decoder, data) {
  const buffer = new m.DecoderBuffer();
  try {
    buffer.Init(data, data.length);
    if (decoder.GetEncodedGeometryType(buffer) !== m.TRIANGULAR_MESH)
      throw new Error('[KHR_draco_mesh_compression] Tipo di geometria sconosciuto.');
    const dracoMesh = new m.Mesh();
    const status = decoder.DecodeBufferToMesh(buffer, dracoMesh);
    if (!status.ok() || dracoMesh.ptr === 0)
      throw new Error('[KHR_draco_mesh_compression] Decodifica fallita.');
    return dracoMesh;
  } finally {
    m.destroy(buffer);
  }
}

function decodeIndex(m, decoder, mesh) {
  const numIndices = mesh.num_faces() * 3;
  let ptr, indices;
  if (mesh.num_points() <= 65534) {
    const byteLength = numIndices * 2;
    ptr = m._malloc(byteLength);
    decoder.GetTrianglesUInt16Array(mesh, byteLength, ptr);
    indices = new Uint16Array(m.HEAPU8.buffer, ptr, numIndices).slice();
  } else {
    const byteLength = numIndices * 4;
    ptr = m._malloc(byteLength);
    decoder.GetTrianglesUInt32Array(mesh, byteLength, ptr);
    indices = new Uint32Array(m.HEAPU8.buffer, ptr, numIndices).slice();
  }
  m._free(ptr);
  return indices;
}

function decodeAttribute(m, decoder, mesh, attribute, accessorDef) {
  const ArrayCtor  = componentArray(accessorDef.componentType);
  const numValues  = mesh.num_points() * attribute.num_components();
  const byteLength = numValues * ArrayCtor.BYTES_PER_ELEMENT;
  const ptr = m._malloc(byteLength);
  decoder.GetAttributeDataArrayForAllPoints(
    mesh, attribute, dataType(m, accessorDef.componentType), byteLength, ptr);
  const array = new ArrayCtor(m.HEAPU8.buffer, ptr, numValues).slice();
  m._free(ptr);
  return array;
}

export class KHRDracoMeshCompressionStreaming extends KHRDracoMeshCompression {
  preread(context) {
    if (!this._decoderModule)
      throw new Error('[KHR_draco_mesh_compression] Dipendenza "draco3d.decoder" mancante.');
    const m = this._decoderModule;
    const jsonDoc = context.jsonDoc;

    // Le primitive che condividono lo stesso bufferView Draco vanno
    // decodificate una volta sola: raggruppa prima di decodificare.
    const groups = new Map();
    for (const meshDef of jsonDoc.json.meshes || []) {
      for (const primDef of meshDef.primitives) {
        const dracoDef = primDef.extensions?.[KHRDracoMeshCompression.EXTENSION_NAME];
        if (!dracoDef) continue;
        if (!groups.has(dracoDef.bufferView)) groups.set(dracoDef.bufferView, []);
        groups.get(dracoDef.bufferView).push([primDef, dracoDef]);
      }
    }

    for (const [bufferViewIdx, prims] of groups) {
      const bufferViewDef = jsonDoc.json.bufferViews[bufferViewIdx];
      const bufferDef = jsonDoc.json.buffers[bufferViewDef.buffer];
      const resource = bufferDef.uri
        ? jsonDoc.resources[bufferDef.uri]
        : jsonDoc.resources[GLB_BUFFER];
      const data = BufferUtils.toView(
        resource, bufferViewDef.byteOffset || 0, bufferViewDef.byteLength);

      const decoder = new m.Decoder();
      let dracoMesh = null;
      try {
        dracoMesh = decodeGeometry(m, decoder, data);
        for (const [primDef, dracoDef] of prims) {
          for (const semantic in dracoDef.attributes) {
            const accessorDef = jsonDoc.json.accessors[primDef.attributes[semantic]];
            const attr = decoder.GetAttributeByUniqueId(dracoMesh, dracoDef.attributes[semantic]);
            context.accessors[primDef.attributes[semantic]]
              .setArray(decodeAttribute(m, decoder, dracoMesh, attr, accessorDef));
          }
          if (primDef.indices !== undefined)
            context.accessors[primDef.indices].setArray(decodeIndex(m, decoder, dracoMesh));
        }
      } finally {
        if (dracoMesh) m.destroy(dracoMesh);
        m.destroy(decoder);
      }
    }
    return this;
  }
}
