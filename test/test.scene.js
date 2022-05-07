/* global describe, it, before */
let app = require('../dist/scripts/app').default
let request = require('supertest').agent(app.listen())
let should = require('chai').should()
let Random = require('mockjs').Random
const { Scene } = require('../dist/models')
const { mockUsers, mockRepository, prepare } = require('./helper')

describe('Property', () => {
  let users = mockUsers()
  let repository = mockRepository()
  prepare(request, should, users, repository)
  let mod = {}
  let itf = {}
  let scene = {}
  const json = JSON.stringify({name: Random.name(), age: Random.integer()})
  before(done => {
    mod = repository.modules[0]
    itf = mod.interfaces[0]
    scene = {
      sceneName: Random.word(6),
      sceneKey: Random.word(6),
      sceneData: json,
      headers: json,
      repositoryId: repository.id,
      moduleId: mod.id,
      interfaceId: itf.id
    }
    done()
  })

  let validScene = (scene) => {
    scene.sceneName.should.be.a('string')
    scene.interfaceId.should.be.a('number')
  }

  it('/scene/create', done => {
    request.post('/scene/create')
      .send(scene)
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        scene = res.body.data
        validScene(scene)
        done()
      })
  })

  it('/scene/list', done => {
    request.get('/scene/list')
      .query({ interfaceId: itf.id })
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        const { data } = res.body
        data.should.be.a('array').have.length.within(1, 15)
        data.forEach(item => {
          validScene(item)
        })
        done()
      })
  })

  it('/scene/get', done => {
    request.get('/scene/get')
      .query({ id: scene.id })
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        validScene(res.body.data)
        done()
      })
  })

  it('/scene/update', done => {
    request.post('/scene/update')
      .send({ id: scene.id, name: Random.word(6) })
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        res.body.data.id.should.eq(scene.id)
        done()
      })
  })

  it('/scene/remove', done => {
    request.get('/scene/remove')
      .query({ id: scene.id })
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        res.body.data.should.be.a('array').have.length.within(1, 15)
        done()
      })
  })
})