// Tài liệu OpenAPI sinh từ chính các schema zod trong packages/contracts → không lệch với validation lúc chạy.
// Thêm endpoint mới: đăng ký path ở đây trong cùng PR.
import { Controller, Get } from '@nestjs/common';
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { ZodTypeAny } from 'zod';
import * as C from '@arena/contracts';

const z = C.z;

// Gắn .openapi() vào prototype của đúng bản zod mà packages/contracts dùng (bản ESM).
extendZodWithOpenApi(z);

const data = (schema: ZodTypeAny) => z.object({ data: schema });
const json = (schema: ZodTypeAny, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});
const error = (description: string) => json(C.ApiErrorBody, description);
const notImpl = { 501: error('FEATURE_NOT_IMPLEMENTED — chưa làm ở M0') };
const idParam = z.object({ id: C.Id });

export function buildOpenApi() {
  const r = new OpenAPIRegistry();
  r.registerComponent('securitySchemes', 'session', { type: 'apiKey', in: 'cookie', name: 'arena_session' });
  const auth = [{ session: [] }];

  r.registerPath({
    method: 'get',
    path: '/health',
    tags: ['system'],
    responses: { 200: json(data(C.PublicHealth)) },
  });
  r.registerPath({
    method: 'get',
    path: '/admin/health',
    tags: ['system'],
    security: auth,
    responses: {
      200: json(data(C.ServiceHealth)),
      401: error('Chưa đăng nhập'),
      403: error('Không phải BTC/trọng tài'),
    },
  });

  r.registerPath({
    method: 'get',
    path: '/session',
    tags: ['accounts-teams'],
    responses: { 200: json(data(z.object({ user: C.SessionUser.nullable() }))) },
  });
  r.registerPath({
    method: 'delete',
    path: '/session',
    tags: ['accounts-teams'],
    responses: { 200: json(data(z.object({ user: z.null() }))) },
  });
  r.registerPath({
    method: 'get',
    path: '/dev/accounts',
    tags: ['accounts-teams', 'demo'],
    description: 'Chỉ có khi DEMO_MODE bật (development/test).',
    responses: { 200: json(data(z.array(C.DemoAccount))), 404: error('DEMO_DISABLED') },
  });
  r.registerPath({
    method: 'post',
    path: '/dev/session',
    tags: ['accounts-teams', 'demo'],
    description: 'Đăng nhập mẫu. Chỉ có khi DEMO_MODE bật (development/test).',
    request: { body: { content: { 'application/json': { schema: C.DevSessionRequest } } } },
    responses: {
      200: json(data(z.object({ user: C.SessionUser }))),
      400: error('VALIDATION_ERROR'),
      404: error('DEMO_DISABLED / không có tài khoản'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['accounts-teams'],
    request: { body: { content: { 'application/json': { schema: C.CompleteRegistrationRequest } } } },
    responses: {
      201: json(data(z.object({ accountId: C.Id }))),
      400: error('VALIDATION_ERROR'),
      409: error('Email hoặc MSSV đã đăng ký'),
      429: error('RATE_LIMITED'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['accounts-teams'],
    request: { body: { content: { 'application/json': { schema: C.LoginRequest } } } },
    responses: {
      200: json(data(z.object({ user: C.SessionUser }))),
      400: error('VALIDATION_ERROR'),
      401: error('Email hoặc mật khẩu không đúng'),
      429: error('RATE_LIMITED'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/auth/registration-code',
    tags: ['accounts-teams'],
    request: { body: { content: { 'application/json': { schema: C.RegistrationEmailRequest } } } },
    responses: {
      200: json(data(z.object({ expiresAt: z.string().datetime(), serverTime: z.string().datetime() }))),
      400: error('VALIDATION_ERROR'),
      409: error('CONFLICT'),
      429: error('RATE_LIMITED'),
      500: error('Không gửi được mã xác minh'),
    },
  });
  // TV1 endpoints use the same request schemas as HTTP validation.
  const tv1Routes: {
    method: 'get' | 'post' | 'patch' | 'delete';
    path: string;
    schema?: ZodTypeAny;
    access?: 'user' | 'admin';
  }[] = [
    { method: 'get', path: '/auth/options' },
    { method: 'post', path: '/auth/forgot-password', schema: C.EmailRequest },
    { method: 'post', path: '/auth/resend-verification', access: 'user' },
    { method: 'post', path: '/auth/verify-email', schema: C.TokenRequest },
    { method: 'post', path: '/auth/reset-password', schema: C.ResetPasswordRequest },
    { method: 'get', path: '/profile', access: 'user' },
    { method: 'patch', path: '/profile', schema: C.ProfileUpdateRequest, access: 'user' },
    { method: 'post', path: '/profile/password', schema: C.ChangePasswordRequest, access: 'user' },
    { method: 'post', path: '/teams/mine/captain', schema: C.TransferCaptainRequest, access: 'user' },
    { method: 'delete', path: '/teams/mine/members/{accountId}', access: 'user' },
    { method: 'get', path: '/notifications', access: 'user' },
    { method: 'post', path: '/notifications/read-all', access: 'user' },
    { method: 'post', path: '/notifications/{id}/read', access: 'user' },
    { method: 'get', path: '/dev/mailbox', access: 'user' },
    { method: 'get', path: '/publications' },
    { method: 'get', path: '/admin/publications', access: 'admin' },
    { method: 'post', path: '/admin/publications', schema: C.PublicationRequest, access: 'admin' },
    { method: 'patch', path: '/admin/publications/{id}', schema: C.PublicationRequest, access: 'admin' },
    { method: 'delete', path: '/admin/publications/{id}', access: 'admin' },
    { method: 'get', path: '/admin/accounts', access: 'admin' },
    { method: 'patch', path: '/admin/accounts/{id}', schema: C.AdminAccountRequest, access: 'admin' },
    { method: 'get', path: '/admin/teams', access: 'admin' },
    { method: 'patch', path: '/admin/teams/{id}', schema: C.AdminTeamRequest, access: 'admin' },
    { method: 'get', path: '/admin/tv1/audit', access: 'admin' },
    { method: 'get', path: '/admin/mail-status', access: 'admin' },
    { method: 'post', path: '/admin/mail-status/{id}/retry', access: 'admin' },
    { method: 'post', path: '/admin/notification-events', access: 'admin' },
  ];
  for (const route of tv1Routes) {
    const params: Record<string, ZodTypeAny> = {};
    for (const match of route.path.matchAll(/\{([^}]+)\}/g)) params[match[1]!] = C.Id;
    r.registerPath({
      method: route.method,
      path: route.path,
      tags: ['accounts-teams'],
      description: route.access === 'admin' ? 'Chỉ quản trị viên.' : undefined,
      security: route.access ? auth : undefined,
      request: {
        ...(Object.keys(params).length ? { params: z.object(params) } : {}),
        ...(route.schema ? { body: { content: { 'application/json': { schema: route.schema } } } } : {}),
      },
      responses: {
        200: json(data(z.unknown())),
        ...(route.method === 'post' ? { 201: json(data(z.unknown())) } : {}),
        400: error('VALIDATION_ERROR'),
        401: error('UNAUTHENTICATED'),
        403: error('FORBIDDEN'),
        404: error('NOT_FOUND'),
        409: error('CONFLICT'),
        429: error('RATE_LIMITED'),
      },
    });
  }
  r.registerPath({
    method: 'get',
    path: '/teams/mine',
    tags: ['accounts-teams'],
    security: auth,
    responses: { 200: json(data(z.object({ team: C.TeamView.nullable() }))), 401: error('Chưa đăng nhập') },
  });
  r.registerPath({
    method: 'post',
    path: '/teams',
    tags: ['accounts-teams'],
    security: auth,
    request: { body: { content: { 'application/json': { schema: C.CreateTeamRequest } } } },
    responses: {
      201: json(data(z.object({ team: C.TeamView }))),
      400: error('VALIDATION_ERROR'),
      401: error('UNAUTHENTICATED'),
      403: error('FORBIDDEN'),
      409: error('CONFLICT'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/teams/join',
    tags: ['accounts-teams'],
    security: auth,
    request: { body: { content: { 'application/json': { schema: C.JoinTeamRequest } } } },
    responses: {
      201: json(data(z.object({ team: C.TeamView }))),
      400: error('VALIDATION_ERROR'),
      401: error('UNAUTHENTICATED'),
      403: error('FORBIDDEN'),
      404: error('NOT_FOUND'),
      409: error('CONFLICT'),
    },
  });

  r.registerPath({
    method: 'get',
    path: '/bots',
    tags: ['bots-runner'],
    security: auth,
    request: { query: z.object({ teamId: C.Id.optional() }) },
    responses: {
      200: json(data(z.array(C.BotVersion))),
      401: error('Chưa đăng nhập'),
      403: error('Bot của đội khác'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/bots',
    tags: ['bots-runner'],
    security: auth,
    responses: notImpl,
  });
  r.registerPath({
    method: 'get',
    path: '/bots/{id}/source',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: notImpl,
  });
  r.registerPath({
    method: 'post',
    path: '/bots/{id}/test-runs',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: notImpl,
  });
  r.registerPath({
    method: 'get',
    path: '/jobs/{id}',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: {
      200: json(data(C.JobView)),
      403: error('Không phải BTC/trọng tài'),
      404: error('Không có job'),
    },
  });

  r.registerPath({
    method: 'get',
    path: '/tournaments/current',
    tags: ['tournaments'],
    responses: { 200: json(data(C.TournamentView)), 404: error('Chưa có giải') },
  });
  r.registerPath({
    method: 'get',
    path: '/tournaments/{id}/standings',
    tags: ['tournaments'],
    request: { params: idParam },
    responses: notImpl,
  });
  const adminResponses = {
    200: json(data(C.TournamentView)),
    400: error('Dữ liệu không hợp lệ'),
    401: error('Chưa đăng nhập'),
    403: error('Sai quyền'),
    404: error('Không tìm thấy'),
    409: error('Sai trạng thái, lịch hoặc revision'),
  };
  r.registerPath({
    method: 'get',
    path: '/admin/tournaments',
    tags: ['tournaments'],
    security: auth,
    responses: {
      200: json(data(z.array(C.TournamentView))),
      401: error('Chưa đăng nhập'),
      403: error('Sai quyền'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/admin/tournaments',
    tags: ['tournaments'],
    security: auth,
    request: { body: { content: { 'application/json': { schema: C.CreateTournamentRequest } } } },
    responses: {
      201: json(data(C.TournamentView)),
      400: error('Dữ liệu không hợp lệ'),
      401: error('Chưa đăng nhập'),
      403: error('Sai quyền'),
    },
  });
  for (const [method, path, schema, params] of [
    ['patch', '/admin/tournaments/{id}', C.UpdateTournamentRequest, idParam],
    ['post', '/admin/tournaments/{id}/stages', C.StageConfigurationRequest, idParam],
    [
      'patch',
      '/admin/tournaments/{id}/stages/{stageId}',
      C.StageConfigurationRequest,
      idParam.extend({ stageId: C.Id }),
    ],
    ['post', '/admin/tournaments/{id}/configuration', C.ConfigurationActionRequest, idParam],
    [
      'post',
      '/admin/tournaments/{id}/stages/{stageId}/configuration',
      C.ConfigurationActionRequest,
      idParam.extend({ stageId: C.Id }),
    ],
    ['post', '/admin/tournaments/{id}/publish', C.RevisionRequest.strict(), idParam],
  ] as const) {
    r.registerPath({
      method,
      path,
      tags: ['tournaments'],
      security: auth,
      description:
        'Chỉ BTC; cấu hình tách biệt kết quả thi đấu. expectedRevision chống ghi đè. POST thành công trả 201; PATCH trả 200.',
      request: { params, body: { content: { 'application/json': { schema } } } },
      responses: { ...adminResponses, ...(method === 'post' ? { 201: json(data(C.TournamentView)) } : {}) },
    });
  }
  r.registerPath({
    method: 'get',
    path: '/admin/tournaments/{id}/audit',
    tags: ['tournaments'],
    security: auth,
    request: { params: idParam },
    responses: {
      200: json(data(z.array(C.TournamentAuditEntry))),
      401: error('Chưa đăng nhập'),
      403: error('Sai quyền'),
      404: error('Không tìm thấy'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/tournaments/{id}/stages/{stageId}/pairings',
    tags: ['tournaments'],
    security: auth,
    responses: notImpl,
  });
  r.registerPath({
    method: 'post',
    path: '/appeals',
    tags: ['tournaments'],
    security: auth,
    responses: notImpl,
  });

  r.registerPath({
    method: 'get',
    path: '/rooms',
    tags: ['rooms-matches'],
    responses: { 200: json(data(z.array(C.RoomListItem))) },
  });
  r.registerPath({
    method: 'get',
    path: '/rooms/{id}',
    tags: ['rooms-matches'],
    description: 'Snapshot mới nhất. Chỉ đọc: không tạo ván, không tung xu, không enqueue job.',
    request: { params: idParam },
    responses: { 200: json(data(C.RoomSnapshot)), 404: error('Không có phòng') },
  });
  r.registerPath({
    method: 'get',
    path: '/games/{id}/events',
    tags: ['rooms-matches'],
    request: { params: idParam, query: z.object({ afterSeq: z.number().int().nonnegative().optional() }) },
    responses: { 200: json(data(z.array(C.RoomEvent))) },
  });
  r.registerPath({
    method: 'post',
    path: '/demo/games',
    tags: ['rooms-matches', 'demo'],
    security: auth,
    description:
      'BTC tạo ván mô phỏng. 201 khi tạo mới; 200 khi requestKey đã tồn tại (trả job cũ). Chỉ khi DEMO_MODE bật.',
    request: { body: { content: { 'application/json': { schema: C.DemoGameRequest } } } },
    responses: {
      201: json(
        data(z.object({ created: z.literal(true), roomId: C.Id, gameId: C.Id, job: C.JobView })),
        'Đã tạo',
      ),
      200: json(
        data(z.object({ created: z.literal(false), roomId: C.Id, gameId: C.Id, job: C.JobView })),
        'requestKey đã có',
      ),
      409: error('Phòng đang có ván'),
      403: error('Không phải BTC'),
    },
  });
  r.registerPath({
    method: 'post',
    path: '/rooms',
    tags: ['rooms-matches'],
    security: auth,
    responses: notImpl,
  });
  r.registerPath({
    method: 'post',
    path: '/rooms/{id}/choices',
    tags: ['rooms-matches'],
    security: auth,
    request: { params: idParam },
    responses: notImpl,
  });

  return new OpenApiGeneratorV3(r.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Bot Arena API',
      version: `v${C.CONTRACT_VERSION}`,
      description: 'M0 — thành công {data, meta?}; lỗi {error:{code,message,details?,requestId}}.',
    },
    servers: [{ url: '/api/v1' }],
  });
}

@Controller()
export class OpenApiController {
  private readonly doc = buildOpenApi();

  @Get('openapi.json')
  openapi() {
    return this.doc;
  }
}
