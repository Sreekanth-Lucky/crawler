const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'crawler.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const transformData = data => {
  const result = {}
  data.forEach(item => {
    if (!result[item.domain]) {
      result[item.domain] = []
    }
    result[item.domain].push(item.url)
  })
  return result
}

//Middleware
const authToken = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('invalid jwt token')
  } else {
    jwt.verify(jwtToken, 'RAMA_SITA', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('invalid jwt token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//REGISTER API

app.post('/register', async (request, response) => {
  const {username, password, gender, name} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbResponse = await db.get(getUserQuery)
  if (dbResponse !== undefined) {
    response.status(400)
    response.send('username already exits')
  } else {
    const createUserQuery = `
      INSERT INTO user(username,password,gender,name)
      VALUES(
        '${username}',
        '${hashedPassword}',
        '${gender}',
        '${name}'
      );
    `
    await db.run(createUserQuery)
    response.send('user successfully created')
  }
})

//Login API

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const payload = {username: username}
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbResponse = await db.get(getUserQuery)
  if (dbResponse === undefined) {
    response.status(401)
    response.send('invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbResponse.password,
    )
    if (isPasswordMatched) {
      const jwtToken = jwt.sign(payload, 'RAMA_SITA')
      response.send({jwtToken})
    } else {
      response.status(401)
      response.send('invalid password')
    }
  }
})

// Get Books API
app.get('/domains/', authToken, async (request, response) => {
  const getDomainsQuery = `
    SELECT
      *
    FROM
      webdomains
    ORDER BY
      id;`
  const domainsArray = await db.all(getDomainsQuery)
  response.send(domainsArray)
})

//Get Domain API
app.get('/domains/:domainId/', authToken, async (request, response) => {
  const {domainId} = request.params
  const getDomainsQuery = `
    SELECT
      *
    FROM
      webdomains
    WHERE id = ${domainId};`
  const domainName = await db.get(getDomainsQuery)
  response.send(domainName)
})

//GET Product Urls
app.get('/producturls/', authToken, async (request, response) => {
  const getUrlsQuery = `
    SELECT
      *
    FROM
      productlinks
    ORDER BY
      id;`
  const urlArray = await db.all(getUrlsQuery)
  response.send(urlArray)
})

//GET Product Urls based on domain_id
app.get('/producturls/:domainId', authToken, async (request, response) => {
  const {domainId} = request.params
  const getUrlQuery = `
    SELECT
      *
    FROM
      productlinks
    WHERE
      domain_id = ${domainId};`
  const urlArray = await db.all(getUrlQuery)
  response.send(urlArray)
})

//GET product_urls based on domain_names

app.get('/domain/producturl/', authToken, async (request, response) => {
  const getDomainsQuery = `
    SELECT
      *
    FROM
      webdomains INNER JOIN productlinks
      ON webdomains.id = productlinks.domain_id;`

  const domainsUrlsArray = await db.all(getDomainsQuery)
  response.send(transformData(domainsUrlsArray))
})

//INSERT domains
app.post('/domain/crawl/', authToken, async (request, response) => {
  const {domain} = request.body
  const addDomainQuery = `
    INSERT INTO
      webdomains(domain)
    VALUES(
      '${domain}'
    );
  `
  await db.run(addDomainQuery)
  response.send('Domain added Successfully!!')
})

//INSERT product urls
app.post('/product/url/crawl/', authToken, async (request, response) => {
  const {domainId, url} = request.body
  const addProductUrlQuery = `
    INSERT INTO
      productlinks(domain_id, url)
    VALUES(
      ${domainId},
      '${url}'
    );
  `
  await db.run(addProductUrlQuery)
  response.send('Product Url Added Successfully')
})

//DELETE product urls

app.delete(
  '/product/url/:domainId/:productId',
  authToken,
  async (request, response) => {
    const {domainId, productId} = request.params
    console.log(domainId)
    console.log(productId)
    const deleteProductUrls = `
    DELETE FROM productlinks
    WHERE 
      id = ${productId} AND domain_id = ${domainId};
  `

    await db.run(deleteProductUrls)
    response.send('Product Url Deleted Successfully!!')
  },
)

//DELETE domains

app.delete('/domain/:id', authToken, async (request, response) => {
  const {id} = request.params
  const deleteDomainQuery = `
    DELETE FROM webdomains
    WHERE id = ${id};
  `

  await db.run(deleteDomainQuery)
  response.send('Domain Deleted Successfully!!')
})
