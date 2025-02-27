/* eslint-env jest */

// npm dependencies
const request = require('supertest')
const path = require('path')
const cheerio = require('cheerio')

// local dependencies
const { sleep } = require('../../lib/utils')

// with NODE_ENV=test express hides error messages
process.env.NODE_ENV = 'development'
process.env.IS_INTEGRATION_TEST = 'true'

let kitRoutesApi

const getPageTitle = html => {
  const $ = cheerio.load(html)
  return $('title').text().trim()
}
const getH1 = html => {
  const $ = cheerio.load(html)
  return $('h1').text().trim()
}
const getFirstParagraph = html => {
  const $ = cheerio.load(html)
  return $('p').text().trim()
}
const getErrorFile = html => {
  const $ = cheerio.load(html)
  return $('#govuk-prototype-kit-error-file').text().trim()
}
const getErrorMessage = html => {
  const $ = cheerio.load(html)
  return $('#govuk-prototype-kit-error-message').text().trim()
}

describe('error handling', () => {
  let testRouter

  beforeEach(() => {
    jest.resetModules()

    const pluginsApi = require('../../lib/plugins/plugins')
    const sessionApi = require('../../lib/session')
    const originalGetAppViews = pluginsApi.getAppViews

    kitRoutesApi = require('../../lib/routes/api')
    kitRoutesApi.resetState()
    testRouter = kitRoutesApi.external.setupRouter()

    jest.spyOn(global.console, 'error').mockImplementation()
    jest.spyOn(sessionApi, 'getSessionMiddleware').mockReturnValue((req, res, next) => {
      req.session = {}
      next()
    })
    jest.spyOn(pluginsApi, 'getAppViews').mockImplementation(() => [
      path.join(__dirname, '..', 'fixtures', 'mockNunjucksIncludes'),
      path.join(__dirname, '..', '..', 'lib', 'nunjucks'),
      ...originalGetAppViews()
    ])
  })

  afterEach(() => {
    jest.restoreAllMocks()
    require('../../lib/nunjucks/nunjucksLoader.js').stopWatchingNunjucks()
  })

  it('should show errors to the user in both the terminal and the browser', async () => {
    testRouter.get('/error', (req, res, next) => {
      next(new Error('test error'))
    })

    const app = require('../../server.js')
    const response = await request(app).get('/error')

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('test error')

    expect(response.status).toBe(500)
    expect(getPageTitle(response.text)).toEqual('Error – GOV.UK Prototype Kit – GOV.UK Prototype Kit')
    expect(getH1(response.text)).toEqual('There is an error')
    expect(getErrorFile(response.text)).toEqual('__tests__/spec/errors.js (line 71)')
    expect(getErrorMessage(response.text)).toEqual('test error')

    app.close()
  })

  it('shows an error if a template cannot be found', async () => {
    testRouter.get('/test-page', (req, res) => {
      res.render('test-page.html')
    })

    const app = require('../../server.js')
    const response = await request(app).get('/test-page')

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('template not found: test-page.html')

    expect(response.status).toBe(500)
    expect(getPageTitle(response.text)).toEqual('Error – GOV.UK Prototype Kit – GOV.UK Prototype Kit')
    expect(getH1(response.text)).toEqual('There is an error')
    expect(getErrorFile(response.text)).toEqual('')
    expect(getErrorMessage(response.text)).toEqual('template not found: test-page.html')
  })

  it('shows a not found page', async () => {
    const app = require('../../server.js')
    const response = await request(app).get('/this-does-not-exist')

    expect(console.error).not.toHaveBeenCalled()

    expect(response.status).toBe(404)
    expect(getPageTitle(response.text)).toEqual('Page not found – GOV.UK Prototype Kit – GOV.UK Prototype Kit')
    expect(getH1(response.text)).toEqual('Page not found')
    expect(getFirstParagraph(response.text)).toMatch(/^There is no page at/)
  })

  it('non-fatal errors are not shown in the browser', async () => {
    testRouter.get('/non-fatal-error', (req, res, next) => {
      // an error in a background thread
      setImmediate(next, new Error('test non-fatal error'))
      res.send('OK')
    })

    const app = require('../../server.js')
    const response = await request(app).get('/non-fatal-error')

    await sleep(500) // wait for next(err) to be called

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(
      /^Error: test non-fatal error/
    ))

    expect(response.status).toBe(200)
    expect(response.text).toEqual('OK')
  })
})
