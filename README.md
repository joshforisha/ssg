# ssg

A Node-based static site generator

Usage:
- Single build: `ssg <source-dir> <base-url> <destination-dir>`
- Watch/dev build: `ssg-watch <source-dir> <base-url> <destination-dir>`

---

- Any `index.html` will be used as a Handlebars template for all Markdown files in the same directory, as well as subdirectories.
- Any `template.html` will wrap content and be inserted into the nearest index file.
- Any `*.md` file is parsed into `content` of the relevant template, and output as minified HTML as the named index file.
- Any CSS files will be minified using `clean-css`.
- Any JS files will be minified using `terser`.
- Any other file is copied over as-is to the destination.
