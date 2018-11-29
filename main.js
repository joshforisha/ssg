const Handlebars = require('handlebars')
const fs = require('fs')
const marked = require('marked')

const baseUrl = process.argv.length > 2 ? process.argv[2] : '/'
const buildDir = process.argv.length > 1 ? process.argv[1] : 'build'

function getPages (dir) {
  return new Promise((resolve, reject) => {
    fs.readdir(
      dir,
      { encoding: 'utf8', withFileTypes: true },
      (error, files) => {
        if (error) return reject(error)

        const pages = files
          .filter(f => f.isFile() && f.name.endsWith('.md'))
          .map(f => {
            const outDir = dir.replace(/^src\/?/, '')
            const name = f.name.substring(0, f.name.length - 3)

            return readFile(`${dir}/${f.name}`).then(md => {
              const contentMd = md
                .replace(/\/\//g, `${baseUrl}/`)
                .replace(/__/g, '&emsp;&emsp;')

              return {
                content: marked(contentMd),
                path: name !== 'index' ? `${outDir}/${name}` : outDir
              }
            })
          })

        const subPages = files
          .filter(f => f.isDirectory())
          .map(d => getPages(`${dir}/${d.name}`))

        Promise.all([Promise.all(pages), Promise.all(subPages)]).then(
          ([ps, subs]) => resolve(ps.concat(subs).flat())
        )
      }
    )
  })
}

function readFile (filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (ferr, data) => {
      if (ferr) return reject(ferr)
      resolve(data)
    })
  })
}

const templatePromise = readFile('src/index.html').then(t =>
  Handlebars.compile(t, { noEscape: true })
)

Promise.all([getPages('src'), templatePromise])
  .then(([pages, template]) => {
    pages.forEach(({ content, path }) => {
      const data = template({ baseUrl, content })

      const dirname = path === '' ? '' : `/${path}`
      fs.mkdir(`${buildDir}${dirname}`, { recursive: true }, error => {
        if (error) return console.error(error)

        fs.writeFile(
          `${buildDir}${dirname}/index.html`,
          data,
          {},
          error => {
            if (error) console.error(error)
          }
        )
      })
    })
  })
  .catch(e => console.error(e))
