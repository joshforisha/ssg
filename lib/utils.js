#!/usr/bin/env node

const Handlebars = require('handlebars')
const fs = require('fs')
const marked = require('marked')
const path = require('path')

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
  console.error(error) // eslint-disable-line no-console
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

function processFiles (dir, aliases, layoutPromise) {
  const outDir = destDir + dir.replace(srcDir, '')

  return new Promise((resolve, reject) => {
    fs.readdir(dir, { withFileTypes: true }, (error, files) => {
      if (error) return reject(error)

      const subDirs = []
      const pages = []
      const otherFiles = []
      let templatePromise

      files.forEach(file => {
        const fileName = `${dir}/${file.name}`
        if (file.isDirectory()) {
          subDirs.push(fileName)
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
          .then(([layout, template, md]) => {
            const basename = path.basename(p, path.extname(p))
            const name = basename === 'index' ? '' : basename
            const customMd = md
              .replace(/___/g, '&emsp;&emsp;')
              .replace(/@([^@]*)@/g, (match, aliasKey) => {
                const label = aliasKey.replace(/_/g, ' ')

                if (aliasKey in aliases) {
                  return `[${label}](${aliases[aliasKey]})`
                }

                // eslint-disable-next-line no-console
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
                  }) : marked(customMd)

            const output = layout({
              baseUrl,
              buildDate,
              buildTime,
              content
            })

            return writeFile(`${outDir}/${name}`, 'index.html', output)
          })
      )

      const copyPromises = otherFiles.map(f => copyFile(f, outDir))
      const subPromises = subDirs.map(d =>
        processFiles(d, aliases, layoutPromise)
      )

      return Promise.all([pagePromises, copyPromises, subPromises].flat())
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

function writeFile (dir, filename, data) {
  return new Promise((resolve, reject) => {
    fs.mkdir(dir, { recursive: true }, error => {
      if (error) return reject(error)
      fs.writeFile(`${dir}/${filename}`, data, { encoding: 'utf8' }, error => {
        if (error) return reject(error)
        resolve()
      })
    })
  })
}

module.exports = {
  generate
}
