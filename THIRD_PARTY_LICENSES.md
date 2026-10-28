# Licenze di terze parti

3DCaveViewer è distribuito sotto **GNU GPL v3** (vedi [`LICENSE`](LICENSE)).
Le librerie incluse in `lib/` restano sotto le rispettive licenze, tutte
compatibili con la GPL v3, e vengono distribuite senza modifiche.

| Componente | Versione | Percorso | Licenza |
|---|---|---|---|
| [Three.js](https://threejs.org/) | r160 | `lib/three/` | MIT |
| [Draco decoder](https://github.com/google/draco) (via Three.js) | — | `lib/three/examples/jsm/libs/draco/` | Apache 2.0 |
| [Basis Universal transcoder](https://github.com/BinomialLLC/basis_universal) (via Three.js) | — | `lib/three/examples/jsm/libs/basis/` | Apache 2.0 |
| [meshoptimizer decoder](https://github.com/zeux/meshoptimizer) (via Three.js) | — | `lib/three/examples/jsm/libs/meshopt_decoder.module.js` | MIT |
| [ktx-parse](https://github.com/donmccurdy/KTX-Parse), [zstddec](https://github.com/donmccurdy/zstddec) (via Three.js) | — | `lib/three/examples/jsm/libs/` | MIT |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | — | `lib/three-mesh-bvh/` | MIT, vedi [`lib/three-mesh-bvh/LICENSE`](lib/three-mesh-bvh/LICENSE) |
| [Leaflet](https://leafletjs.com/) | 1.9.4 | `lib/leaflet/` | BSD 2-Clause |
| [Poppins](https://github.com/itfoundry/Poppins) | — | `lib/fonts/` | SIL OFL 1.1, vedi [`lib/fonts/OFL.txt`](lib/fonts/OFL.txt) |

I dati cartografici della mappa sono © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL); la ricerca indirizzi dell'installazione guidata usa
[Nominatim](https://nominatim.org/).

---

## Three.js — MIT License

```
The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Leaflet — BSD 2-Clause License

```
Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Draco e Basis Universal — Apache License 2.0

Testo completo: <https://www.apache.org/licenses/LICENSE-2.0>.
Copyright Google LLC (Draco) e Binomial LLC (Basis Universal).
