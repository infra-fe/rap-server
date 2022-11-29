import pandoc from '../../helpers/pandoc'
import MarkdownService from './markdown'

const markdownToDocx = pandoc('markdown', 'docx', '--wrap', 'none')

export default class DocxService {
  public static async export(repositoryId: number, origin: string, versionId?: number): Promise<Buffer> {
    const markdown = await MarkdownService.export(repositoryId, origin, versionId)
    const docx = markdownToDocx(markdown)
    return docx
  }
}
