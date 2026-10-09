import { Global, Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { OrgController, BranchCrud, CustomFieldCrud } from './org.controller';
import { MembersService } from './members.service';

@Global()
@Module({ controllers: [OrgController, AccessController, BranchCrud, CustomFieldCrud], providers: [MembersService], exports: [MembersService] })
export class OrgModule {}
