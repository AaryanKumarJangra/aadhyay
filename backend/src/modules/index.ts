import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { OrgModule } from './org/org.module';
import { PeopleModule } from './people/people.module';
import { AcademicsModule } from './academics/academics.module';
import { AttendanceModule } from './attendance/attendance.module';
import { HomeworkModule } from './homework/homework.module';
import { ExamsModule } from './exams/exams.module';
import { FeesModule } from './fees/fees.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { CommsModule } from './comms/comms.module';
import { TransportModule } from './transport/transport.module';
import { MessengerModule } from './messenger/messenger.module';
import { CrmModule } from './crm/crm.module';
import { FrontOfficeModule } from './front-office/front-office.module';
import { CmsModule } from './cms/cms.module';
import { HrModule } from './hr/hr.module';
import { AccountsModule } from './accounts/accounts.module';
import { OpsModule } from './ops/ops.module';
import { LearningModule } from './learning/learning.module';
import { ReportsModule } from './reports/reports.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AiModule } from './ai/ai.module';
import { PacksModule } from './packs/packs.module';
import { SearchModule } from './search/search.module';
import { DashboardsModule } from './dashboards/dashboards.module';

/** Registry of feature modules. Add new modules here (docs/02 §3). */
export const FEATURE_MODULES: any[] = [ControlPlaneModule, OrgModule, PeopleModule, AcademicsModule, AttendanceModule, HomeworkModule, ExamsModule, FeesModule, WhatsAppModule, CommsModule, TransportModule, MessengerModule, CrmModule, FrontOfficeModule, CmsModule, HrModule, AccountsModule, OpsModule, LearningModule, ReportsModule, ComplianceModule, AiModule, PacksModule, SearchModule, DashboardsModule];
