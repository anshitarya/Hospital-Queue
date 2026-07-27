import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  Req,
  Headers,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BillingService } from './billing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { CreateSubscriptionOrderDto, VerifySubscriptionPaymentDto } from './dto/subscription.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Super Admin Overview Dashboard aggregates
   */
  @Get('dashboard')
  @Roles(Role.ADMIN)
  async getDashboard() {
    return this.billingService.getSuperAdminDashboard();
  }

  /**
   * Super Admin Businesses billing overview list
   */
  @Get('businesses')
  @Roles(Role.ADMIN)
  async getBusinessesList() {
    return this.billingService.getBusinessesBillingList();
  }

  /**
   * Business owner/admin view of their own clinic
   */
  @Get('my-business')
  @Roles(Role.CLINIC_ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  async getMyBusiness(@CurrentUser() user: AuthUser) {
    if (!user.clinicId) {
      throw new BadRequestException('Your staff profile is not linked to any business.');
    }
    return this.billingService.getBusinessBillingDetails(user.clinicId);
  }

  /**
   * Clinic billing drilldown details (Super Admin or Clinic Admin)
   */
  @Get('businesses/:id/details')
  @Roles(Role.ADMIN, Role.CLINIC_ADMIN, Role.MANAGER)
  async getBusinessDetails(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== Role.ADMIN && user.clinicId !== id) {
      throw new ForbiddenException('You cannot access another business\'s billing details.');
    }
    return this.billingService.getBusinessBillingDetails(id);
  }

  /**
   * Usage event timeline search & filter (Super Admin or Clinic Admin)
   */
  @Get('events')
  @Roles(Role.ADMIN, Role.CLINIC_ADMIN, Role.MANAGER)
  async getEventsTimeline(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
    @Query('locationId') locationId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('eventType') eventType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    let targetBusinessId = businessId;
    if (user.role !== Role.ADMIN) {
      // Force filter to caller's own business to enforce tenant isolation
      if (!user.clinicId) {
        throw new BadRequestException('Your profile is not linked to a business.');
      }
      targetBusinessId = user.clinicId;
    }

    return this.billingService.getEventsTimeline({
      businessId: targetBusinessId,
      locationId,
      professionalId,
      eventType,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  /**
   * Create a new billing plan (Super Admin only)
   */
  @Post('plans')
  @Roles(Role.ADMIN)
  async createPlan(
    @Body()
    body: {
      name: string;
      description?: string;
      billingCycle?: string;
      rules: { eventType: string; price: number; ruleType?: string }[];
    },
  ) {
    return this.billingService.createPlan(body);
  }

  /**
   * Get all active billing plans (Super Admin and Clinic Admin)
   */
  @Get('plans')
  @Roles(Role.ADMIN, Role.CLINIC_ADMIN)
  async getPlans() {
    return this.billingService.getPlans();
  }

  /**
   * Assign business to plan (Super Admin only)
   */
  @Post('businesses/:id/assign-plan')
  @Roles(Role.ADMIN)
  async assignPlan(
    @Param('id') id: string,
    @Body() body: { planId: string; customPricing?: Record<string, number> },
  ) {
    return this.billingService.assignPlanToBusiness(id, body.planId, body.customPricing);
  }

  /**
   * Generate Invoice (Super Admin only)
   */
  @Post('businesses/:id/generate-invoice')
  @Roles(Role.ADMIN)
  async generateInvoice(
    @Param('id') id: string,
    @Body() body: { startDate: string; endDate: string; discount?: number },
  ) {
    return this.billingService.generateInvoice(
      id,
      new Date(body.startDate),
      new Date(body.endDate),
      body.discount || 0,
    );
  }

  /**
   * Pay/Settle Outstanding Invoice
   */
  @Post('invoices/:id/pay')
  @Roles(Role.ADMIN, Role.CLINIC_ADMIN, Role.MANAGER)
  async payInvoice(
    @Param('id') id: string,
    @Body() body: { amount: number; paymentMethod?: string; referenceId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new BadRequestException('Invoice not found');

    if (user.role !== Role.ADMIN && user.clinicId !== invoice.businessId) {
      throw new ForbiddenException('Not authorized to settle this invoice.');
    }

    return this.billingService.payInvoice(
      id,
      body.amount,
      body.paymentMethod || 'CASH',
      body.referenceId,
    );
  }

  /**
   * Void/Delete Unpaid Invoice (Super Admin only)
   */
  @Post('invoices/:id/void')
  @Roles(Role.ADMIN)
  async voidInvoice(@Param('id') id: string) {
    return this.billingService.voidInvoice(id);
  }

  /**
   * Get all invoices generated across the platform (Super Admin only)
   */
  @Get('invoices')
  @Roles(Role.ADMIN)
  async getAllInvoices() {
    return this.billingService.getAllInvoices();
  }

  /**
   * Delete Billing Plan (Super Admin only)
   */
  @Delete('plans/:id')
  @Roles(Role.ADMIN)
  async deletePlan(@Param('id') id: string) {
    return this.billingService.deletePlan(id);
  }

  /**
   * Create a Razorpay subscription order (Clinic Owner only)
   */
  @Post('subscriptions/create-order')
  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  async createSubscriptionOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSubscriptionOrderDto,
  ) {
    if (!user.clinicId) {
      throw new BadRequestException('Your profile is not linked to any clinic.');
    }
    return this.billingService.createSubscriptionOrder(user.clinicId, body.planId);
  }

  /**
   * Verify signature and activate subscription (Clinic Owner only)
   */
  @Post('subscriptions/verify')
  @Roles(Role.CLINIC_ADMIN, Role.ADMIN)
  async verifySubscriptionPayment(
    @CurrentUser() user: AuthUser,
    @Body() body: VerifySubscriptionPaymentDto,
  ) {
    if (!user.clinicId) {
      throw new BadRequestException('Your profile is not linked to any clinic.');
    }
    return this.billingService.verifySubscriptionPayment(user.clinicId, body);
  }

  /**
   * Public Razorpay Webhook Endpoint
   */
  @Public()
  @Post('webhook')
  async razorpayWebhook(
    @Req() req: any,
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: any,
  ) {
    if (!signature) {
      throw new BadRequestException('Webhook signature is missing');
    }
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    return this.billingService.handleRazorpayWebhook(rawBody, signature, body);
  }
}
