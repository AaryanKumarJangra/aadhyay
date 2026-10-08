import { Module } from '@nestjs/common';
import { CmsController, SiteController, PageCrud, PostCrud, RedirectCrud, FormCrud, SubmissionCrud } from './cms.controller';
import { CmsService } from './cms.service';

@Module({ controllers: [CmsController, SiteController, PageCrud, PostCrud, RedirectCrud, FormCrud, SubmissionCrud], providers: [CmsService], exports: [CmsService] })
export class CmsModule {}
