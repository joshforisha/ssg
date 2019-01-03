# ssg
A Node-based static site generator

Usage: `ssg <base-url> <source-dir> <destination-dir>`

* Any `index.html` will be used as a Handlebars template for all Markdown files in the same directory, as well as subdirectories.
* Any `*.md` file is parsed into `content` of the relevant template, and output as HTML as the named index file.
* Any other file is copied over as-is to the destination.
