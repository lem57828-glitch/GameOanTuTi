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
  r.registerPath({ method: 'post', path: '/auth/register', tags: ['accounts-teams'], responses: notImpl });
  r.registerPath({ method: 'post', path: '/auth/login', tags: ['accounts-teams'], responses: notImpl });
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
    responses: notImpl,
  });
  r.registerPath({
    method: 'post',
    path: '/teams/{id}/members',
    tags: ['accounts-teams'],
    security: auth,
    request: { params: idParam },
    responses: notImpl,
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
    request: { body: { required: true, content: { 'application/json': { schema: C.SubmitBotInput } } } },
    responses: {
      201: json(data(C.BotVersion)),
      400: error('Mã/nguồn không hợp lệ'),
      403: error('Không có quyền'),
    },
  });
  r.registerPath({
    method: 'get',
    path: '/bots/{id}/source',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: { 200: json(data(C.BotSourceDetail)), 403: error('Không có quyền') },
  });
  r.registerPath({
    method: 'post',
    path: '/bots/{id}/test-runs',
    tags: ['bots-runner'],
    security: auth,
    request: {
      params: idParam,
      body: { required: true, content: { 'application/json': { schema: C.CreateTestRunInput } } },
    },
    responses: {
      201: json(data(C.TestRunDetail)),
      400: error('Yêu cầu không hợp lệ'),
      403: error('Không có quyền'),
    },
  });
  r.registerPath({
    method: 'get',
    path: '/test-runs/{id}',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: { 200: json(data(C.TestRunDetail)), 403: error('Không có quyền') },
  });
  r.registerPath({
    method: 'get',
    path: '/bots/{id}/test-runs',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: { 200: json(data(z.array(C.TestRunDetail))) },
  });
  for (const suffix of ['', '/lock'])
    r.registerPath({
      method: 'post',
      path: `/stages/{stageId}/bot-selection${suffix}`,
      tags: ['bots-runner'],
      security: auth,
      request: {
        params: z.object({ stageId: C.Id }),
        body: { required: true, content: { 'application/json': { schema: C.BotSelectionInput } } },
      },
      responses: {
        201: json(data(C.BotSelectionView)),
        400: error('Bộ bot không hợp lệ'),
        403: error('Không có quyền'),
        409: error('Đã khóa'),
      },
    });
  r.registerPath({
    method: 'get',
    path: '/stages/{stageId}/bot-selection/{teamId}',
    tags: ['bots-runner'],
    security: auth,
    request: { params: z.object({ stageId: C.Id, teamId: C.Id }) },
    responses: { 200: json(data(C.BotSelectionView.nullable())) },
  });
  r.registerPath({
    method: 'get',
    path: '/admin/bots/duplicates',
    tags: ['bots-runner'],
    security: auth,
    responses: {
      200: json(
        data(
          z.array(
            z.object({
              id: C.Id,
              teamId: C.Id,
              label: z.string(),
              sourceHash: z.string(),
              duplicateOfId: C.Id.nullable(),
              createdAt: C.IsoDateTime,
            }),
          ),
        ),
      ),
      403: error('Chỉ BTC/trọng tài'),
    },
  });
  r.registerPath({
    method: 'get',
    path: '/games/{id}/bot-diagnostics',
    tags: ['bots-runner'],
    security: auth,
    request: { params: idParam },
    responses: {
      200: json(
        data(
          z.array(
            z.object({
              id: C.Id,
              attemptNo: z.number().int(),
              status: z.string(),
              diagnostics: z.string().nullable(),
            }),
          ),
        ),
      ),
      403: error('Chỉ đội sở hữu/staff'),
      404: error('Không có ván'),
    },
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
