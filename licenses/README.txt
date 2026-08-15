Licences of the third-party libraries bundled in build/.

The plugin's own code (src-js/, includes/, and the main PHP file) is GPLv2 or
later. The files under build/ additionally contain the compiled/bundled form of
the libraries below, each of which keeps its own licence. esbuild strips source
comments when it minifies, so the full licence texts are reproduced here instead
of inside the bundles.

  @jsquash/avif   2.1.1   Apache-2.0        jsquash-avif.txt
  @jsquash/webp   1.5.0   Apache-2.0        jsquash-webp.txt
  @jsquash/jpeg   1.6.0   Apache-2.0        jsquash-jpeg.txt
  heic-to         1.5.2   LGPL-3.0          heic-to.txt
  utif2           4.1.0   MIT               utif2.txt
  pako            1.0.11  MIT AND Zlib      pako.txt   (bundled via utif2)

Upstream sources, and the C/C++ projects the .wasm codecs are compiled from,
are listed in readme.txt under "Third-party libraries" and "The .wasm files".

Because heic-to bundles libheif (LGPL-3.0) and the @jsquash packages are
Apache-2.0 — both incompatible with GPLv2 alone — the combined work is
distributed under GPLv3, as this plugin's "GPLv2 or later" licence permits. No
GPLv2-only component is bundled.
