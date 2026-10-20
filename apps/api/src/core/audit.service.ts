// Ghi thao tác quản trị/demo vào AuditLog (bảng dùng chung).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from './prisma.service.js';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  target?: string;
  reason?: string;
  data?: Prisma.InputJsonValue;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Tx = this.prisma): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}
