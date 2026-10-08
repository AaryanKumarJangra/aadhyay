import { Global, Module } from '@nestjs/common';
import { PeopleController, DepartmentCrud, DesignationCrud, DocumentCrud } from './people.controller';
import { PeopleService } from './people.service';

@Global()
@Module({ controllers: [PeopleController, DepartmentCrud, DesignationCrud, DocumentCrud], providers: [PeopleService], exports: [PeopleService] })
export class PeopleModule {}
