import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Messenger } from '@aadhyay/contracts';
import { NoTenant, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { MessengerService } from './messenger.service';
import { turnCredentials } from '../../adapters/turn/turn';
import { Ctx } from '../../kernel/context/request-context';

/** Personal messenger — works for every logged-in user, with or without an institution. */
@Controller('messenger')
export class MessengerController {
  constructor(private readonly svc: MessengerService) {}

  @NoTenant() @Post('devices') register(@Body(Z(Messenger.registerDevice)) b: any) { return this.svc.registerDevice(b); }
  @NoTenant() @Post('prekeys') prekeys(@Body(Z(Messenger.uploadPrekeys)) b: any) { return this.svc.uploadPrekeys(b.deviceId, b.preKeys); }
  @NoTenant() @Put('signed-prekey') spk(@Body(Z(Messenger.rotateSignedPrekey)) b: any) { return this.svc.rotateSignedPrekey(b.deviceId, b.keyId, b.publicKey, b.signature); }
  @NoTenant() @Get('prekeys/count') count(@Query('deviceId') d: string) { return this.svc.prekeyCount(d); }
  @NoTenant() @Get('keys/:userId') bundles(@Param('userId') u: string) { return this.svc.bundles(u); }
  @NoTenant() @Post('contacts/discover') discover(@Body(Z(Messenger.discoverContacts)) b: any) { return this.svc.discover(b.phones); }
  @NoTenant() @Get('conversations') list() { return this.svc.myConversations(); }
  @NoTenant() @Post('conversations') create(@Body(Z(Messenger.createConversation)) b: any) { return this.svc.createConversation(b); }
  @NoTenant() @Get('conversations/:id') get(@Param('id') id: string) { return this.svc.conversationView(id); }
  @NoTenant() @Post('conversations/:id/members') add(@Param('id') id: string, @Body(Z(z.object({ userIds: z.array(z.string().uuid()).min(1) }))) b: any) { return this.svc.addMembers(id, b.userIds); }
  @NoTenant() @Delete('conversations/:id/members/me') leave(@Param('id') id: string) { return this.svc.leave(id); }
  @NoTenant() @Post('messages') send(@Body(Z(Messenger.sendEnvelopes)) b: any) { return this.svc.send(b); }
  @NoTenant() @Get('envelopes') pending(@Query('deviceId') d: string, @Query('cursor') c?: string) { return this.svc.pending(d, c); }
  @NoTenant() @Post('envelopes/ack') ack(@Body(Z(Messenger.ackEnvelopes)) b: any) { return this.svc.ack(b.deviceId, b.envelopeIds); }
  @NoTenant() @Post('receipts') receipts(@Body(Z(Messenger.receiptInput)) b: any) { return this.svc.receipt(b.conversationId, b.messageIds, b.kind); }
  @NoTenant() @Get('receipts/:messageId') receiptsFor(@Param('messageId') id: string) { return this.svc.receiptsFor(id); }
  @NoTenant() @Post('media') media(@Body(Z(Messenger.mediaUploadInit)) b: any) { return this.svc.mediaUpload(b.size, b.recipients); }
  @NoTenant() @Get('media/:id') mediaGet(@Param('id') id: string) { return this.svc.mediaDownload(id); }
  @NoTenant() @Post('media/:id/downloaded') mediaDone(@Param('id') id: string) { return this.svc.mediaDownloaded(id); }
  @NoTenant() @Post('blocks/:userId') block(@Param('userId') u: string) { return this.svc.block(u, true); }
  @NoTenant() @Delete('blocks/:userId') unblock(@Param('userId') u: string) { return this.svc.block(u, false); }
  @NoTenant() @Post('reports') report(@Body(Z(Messenger.reportInput)) b: any) { return this.svc.report(b); }
  @NoTenant() @Get('ice') ice() { return turnCredentials(Ctx.get().userId!); }
  @NoTenant() @Post('calls') call(@Body(Z(Messenger.callStart)) b: any) { return this.svc.startCall(b.conversationId, b.kind); }
  @NoTenant() @Post('calls/:id/join') join(@Param('id') id: string) { return this.svc.joinCall(id); }
  @NoTenant() @Post('calls/:id/end') end(@Param('id') id: string) { return this.svc.endCall(id); }
}

/** Institution chats need the tenant context. */
@RequireModule('messenger')
@Controller('messenger/institution')
export class InstitutionChatController {
  constructor(private readonly svc: MessengerService) {}
  @Post('parent-teacher') pt(@Body(Z(Messenger.institutionChatInput)) b: any) { return this.svc.parentTeacherChat(b.studentId, b.teacherStaffId); }
  @Post('class-group') cg(@Body(Z(z.object({ sectionId: z.string().uuid(), broadcastOnly: z.boolean().default(true) }))) b: any) { return this.svc.classGroup(b.sectionId, b.broadcastOnly); }
}
