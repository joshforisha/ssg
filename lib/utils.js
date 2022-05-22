#!/usr/bin/env node

const CleanCSS = require('clean-css')
const Handlebars = require('handlebars')
const fs = require('fs')
const path = require('path')
const { marked } = require('marked')
const { minify } = require('html-minifier-terser')
const { minify: terser } = require('terser')

const srcDir = process.argv[2]
const baseUrl = process.argv[3]
const destDir = process.argv[4]

marked.setOptions({
  baseUrl,
  breaks: true,
  gfm: true,
  smartypants: true
})

function copyFile (srcFile, dir) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(srcFile)
    fs.mkdir(dir, { recursive: true }, error => {
      if (error) return reject(error)
      fs.copyFile(srcFile, `${dir}/${filename}`, error => {
        if (error) return reject(error)
        resolve()
      })
    })
  })
}

function errorExit (error) {
  console.error(error)
  process.exit(1)
}

function generate () {
  fs.readFile(`${srcDir}/aliases`, { encoding: 'utf8' }, (error, data = '') => {
    if (error && error.code !== 'ENOENT') return errorExit(error)

    const aliases = data.split('\n').reduce((acc, line) => {
      const [alias, url] = line.split(': ')
      if (url) return Object.assign({ [alias]: url }, acc)
      return acc
    }, {})

    processFiles(srcDir, aliases).catch(errorExit)
  })
}

function minifyCSS (source) {
  return new Promise((resolve, reject) => {
    try {
      const output = new CleanCSS().minify(source)
      resolve(output.styles)
      return source
    } catch (error) {
      reject(error)
    }
  })
}

function minifyJS (source) {
  return terser(source).then(({ code }) => code)
}

function processFiles (dir, aliases, layoutPromise) {
  const outDir = destDir + dir.replace(srcDir, '')

  return new Promise((resolve, reject) => {
    fs.readdir(dir, { withFileTypes: true }, (error, files) => {
      if (error) return reject(error)

      const cssFiles = []
      const jsFiles = []
      const subDirs = []
      const pages = []
      const otherFiles = []
      let templatePromise

      files.forEach(file => {
        const fileName = `${dir}/${file.name}`
        if (file.isDirectory()) {
          subDirs.push(fileName)
        } else if (file.name.endsWith('.css')) {
          cssFiles.push(fileName)
        } else if (file.name.endsWith('.js')) {
          jsFiles.push(fileName)
        } else if (file.name.endsWith('.md')) {
          pages.push(fileName)
        } else if (file.name === 'index.html') {
          layoutPromise = readFile(fileName).then(t =>
            Handlebars.compile(t, { noEscape: true })
          )
        } else if (file.name === 'template.html') {
          templatePromise = readFile(fileName).then(t =>
            Handlebars.compile(t, { noEscape: true })
          )
        } else if (file.name !== 'aliases') {
          otherFiles.push(fileName)
        }
      })

      if (!(layoutPromise instanceof Promise)) {
        return reject(new Error(`No layout defined for ${dir}`))
      }

      const pagePromises = pages.map(p =>
        Promise
          .all([layoutPromise, templatePromise, readFile(p)])
          .then(async ([layout, template, md]) => {
            const basename = path.basename(p, path.extname(p))
            const name = basename === 'index' ? '' : basename + '/'
            const customMd = md
              .replace(/___/g, '&emsp;&emsp;')
              .replace(/@([^@]*)@/g, (match, aliasKey) => {
                const label = aliasKey.replace(/_/g, ' ')

                if (aliasKey in aliases) {
                  return `[${label}](${aliases[aliasKey]})`
                }

                console.warn(`${p}: No alias found for "${aliasKey}"`)
                return `[${label}]()`
              })

            const now = new Date()
            const buildDate = now.toDateString()
            const buildTime = now.toLocaleTimeString('en-US', {
              timeStyle: 'short'
            })

            const content =
              template
                ? template({
                  baseUrl,
                  buildDate,
                  buildTime,
                  content: marked(customMd)
                })
                : marked(customMd)

            const output = await minify(layout({
              baseUrl,
              buildDate,
              buildTime,
              content
            }), {
              collapseWhitespace: true,
              minifyCSS: true,
              minifyJS: true,
              removeComments: true,
              removeTagWhitespace: true
            })

            return writeFile(`${outDir}/${name}index.html`, output)
          })
      )

      const cssPromises = cssFiles.map(filePath =>
        readFile(filePath)
          .then(source => minifyCSS(source))
          .then(minifiedSource => writeFile(`${outDir}/${path.basename(filePath)}`, minifiedSource)))

      const jsPromises = jsFiles.map(filePath =>
        readFile(filePath)
          .then(source => minifyJS(source))
          .then(minifiedSource => writeFile(`${outDir}/${path.basename(filePath)}`, minifiedSource)))

      const copyPromises = otherFiles.map(f => copyFile(f, outDir))
      const subPromises = subDirs.map(d => processFiles(d, aliases, layoutPromise))

      return Promise.all([cssPromises, copyPromises, jsPromises, pagePromises, subPromises].flat())
    })
  })
}

function readFile (filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf8' }, (error, data) => {
      if (error) return reject(error)
      resolve(data)
    })
  })
}

function writeFile (filePath, data) {
  const { dir, base } = path.parse(filePath)
  return new Promise((resolve, reject) => {
    fs.mkdir(dir, { recursive: true }, error => {
      if (error) return reject(error)
      fs.writeFile(`${dir}/${base}`, data, { encoding: 'utf8' }, error => {
        if (error) return reject(error)
        resolve()
      })
    })
  })
}

module.exports = {
  generate
}
