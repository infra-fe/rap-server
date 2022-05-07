declare interface IHelper {
  include: string[]
  exclude: {
    generalities: string[]
  }
}
export const Helper: IHelper =  {
  include: [],
  exclude: {
    generalities: ['createdAt', 'updatedAt', 'deletedAt', 'reserve'],
  },
}
