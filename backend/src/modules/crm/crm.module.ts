import { Global, Module } from '@nestjs/common';
import { CrmController, CampaignCrud } from './crm.controller';
import { CrmService } from './crm.service';

@Global()
@Module({ controllers: [CrmController, CampaignCrud], providers: [CrmService], exports: [CrmService] })
export class CrmModule {}
