// TODO 2.2 如何缓存重复查询？https://github.com/rfink/sequelize-redis-cache
import { IncludeOptions } from 'sequelize'
import Interface from '../bo/interface'
import Module from '../bo/module'
import Organization from '../bo/organization'
import Property from '../bo/property'
import Repository from '../bo/repository'
import Tag from '../bo/tag'
import User from '../bo/user'
import { Helper } from './helper'

declare interface IQueryInclude {
  [key: string]: IncludeOptions
}

const SimpleTag: IncludeOptions = {
  model: Tag,
  as: 'tags',
  attributes: { exclude: Helper.exclude.generalities },
  paranoid: false,
  required: false,
}

const QueryInclude: IQueryInclude = {
  User: {
    model: User,
    as: 'user',
    attributes: { exclude: ['password', ...Helper.exclude.generalities] },
    required: true,
  },
  UserForSearch: {
    model: User,
    as: 'user',
    attributes: { include: ['id', 'fullname'] },
    required: true,
  },
  Creator: {
    model: User,
    as: 'creator',
    attributes: { exclude: ['password', ...Helper.exclude.generalities] },
    required: true,
  },
  Owner: {
    model: User,
    as: 'owner',
    attributes: { exclude: ['password', ...Helper.exclude.generalities] },
    required: true,
  },
  OwnerOpen: {
    model: User,
    as: 'owner',
    attributes: { exclude: ['password', ...Helper.exclude.generalities, 'email'] },
    required: true,
  },
  Locker: {
    model: User,
    as: 'locker',
    attributes: { exclude: ['password', ...Helper.exclude.generalities] },
    required: false,
  },
  Members: {
    model: User,
    as: 'members',
    attributes: { exclude: ['password', ...Helper.exclude.generalities] },
    through: { attributes: [] },
    required: false,
  },
  Repository: {
    model: Repository,
    as: 'repository',
    attributes: { exclude: [] },
    paranoid: false,
    required: false,
  },
  Organization: {
    model: Organization,
    as: 'organization',
    attributes: { exclude: [] },
    paranoid: false,
    required: false,
  },
  Module: {
    model: Module,
    as: 'module',
    attributes: { exclude: [] },
    paranoid: false,
    required: false,
  },
  Interface: {
    model: Interface,
    as: 'interface',
    attributes: { exclude: [] },
    paranoid: false,
    required: false,
  },
  Tag: {
    model: Tag,
    as: 'tags',
    attributes: { exclude: [] },
    paranoid: false,
    required: false,
  },
  SimpleTag,
  Collaborators: {
    model: Repository,
    as: 'collaborators',
    attributes: { exclude: [] },
    through: { attributes: [] },
    required: false,
  },
  RepositoryHierarchy: {
    model: Module,
    as: 'modules',
    attributes: { exclude: [] },
    required: false,
    include: [
      {
        model: Interface,
        as: 'interfaces',
        attributes: { exclude: [] },
        required: false,
        include: [
          SimpleTag,
          {
            model: User,
            as: 'locker',
            attributes: { exclude: ['password', ...Helper.exclude.generalities] },
            required: false,
          },
          {
            model: Property,
            as: 'properties',
            attributes: { exclude: [] },
            required: false,
          },
        ],
      },
    ],
  },
  RepositoryHierarchyExcludeProperty: {
    model: Module,
    as: 'modules',
    attributes: { exclude: [] },
    required: false,
    include: [
      {
        model: Interface,
        as: 'interfaces',
        attributes: { exclude: [] },
        required: false,
        include: [
          SimpleTag,
          {
            model: User,
            as: 'locker',
            attributes: { exclude: ['password', ...Helper.exclude.generalities] },
            required: false,
          },
        ],
      },
    ],
  },
  Properties: {
    model: Property,
    as: 'properties',
    attributes: { exclude: [] },
    required: false,
  },
}

export default QueryInclude
