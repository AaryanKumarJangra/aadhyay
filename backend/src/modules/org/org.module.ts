import { Global, Module } from '@nestjs/common';
import { OrgController, BranchCrud, CustomFieldCrud } from './org.controller';
import { MembersService } from './members.service';

@Global()
@Module({ controllers: [OrgController, BranchCrud, CustomFieldCrud], providers: [MembersService], exports: [MembersService] })
export class OrgModule {}
