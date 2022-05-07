/* global describe, it, before */
let app = require('../dist/scripts/app').default
let request = require('supertest').agent(app.listen())
let should = require('chai').should()
const { mockUsers, mockRepository, prepare } = require('./helper')

describe('Mock', () => {
  let users = mockUsers()
  let repository = mockRepository()
  prepare(request, should, users, repository)

  let interfaces
  before(done => {
    request.get('/interface/list')
      .query({ repositoryId: repository.id })
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        interfaces = res.body.data
        done()
      })
  })
  it('/export/openapi/', done => {
    request.get(`/export/openapi?id=${repository.id}`)
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        should.not.exist(err)
        done()
      })
  })
})
