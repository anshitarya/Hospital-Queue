import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

class CreateDepartmentDto {
  @IsString() @MinLength(2) name!: string;
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { doctors: { include: { user: true } } },
    });
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: { name: dto.name } });
  }
}
