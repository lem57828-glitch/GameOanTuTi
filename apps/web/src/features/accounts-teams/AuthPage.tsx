import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input } from '@arena/ui';
import { LoginRequest, type SessionUser } from '@arena/contracts';
import { api, ApiError } from '../../lib/api';
import { sessionKey } from '../../lib/session';
import { usePublicHealth } from '../../lib/health';
import { RegistrationPage } from './RegistrationPage';

export function AuthPage({ register = false }: { register?: boolean }) {
  return register ? <RegistrationPage /> : <LoginPage />;
}
function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const health = usePublicHealth();
  const location = useLocation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (values: LoginRequest) =>
      api<{ user: SessionUser }>('/auth/login', { method: 'POST', json: values }),
    onSuccess: async (result) => {
      qc.setQueryData(sessionKey, result);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      const next = params.get('next');
      navigate(
        next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
          ? next
          : result.user.role === 'student'
            ? '/competition'
            : '/admin',
        {
          replace: true,
        },
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && Array.isArray(error.details))
        setErrors(
          Object.fromEntries(
            error.details.map((i: { path: string; message: string }) => [i.path, i.message]),
          ),
        );
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const result = LoginRequest.safeParse(Object.fromEntries(new FormData(event.currentTarget).entries()));
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    mutation.mutate(result.data);
  }
  return (
    <Card className="mx-auto max-w-lg p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold">Đăng nhập</h1>
      <p className="mt-2 text-sm text-ink-muted">Sử dụng email và mật khẩu bạn đã đăng ký.</p>
      {params.get('registered') === '1' && (
        <div className="mt-4">
          <Alert tone="success" title="Đăng ký thành công">
            Email đã được xác minh. Bạn có thể đăng nhập bằng email và mật khẩu vừa tạo.
          </Alert>
        </div>
      )}
      {params.get('passwordChanged') === '1' && (
        <Alert tone="success" title="Đã đổi mật khẩu. Vui lòng đăng nhập lại." />
      )}
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={(location.state as { email?: string } | null)?.email}
          required
          maxLength={254}
          error={errors.email}
        />
        <Input
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          error={errors.password}
        />
        {mutation.error && (
          <Alert tone="error" title="Không thể đăng nhập">
            {mutation.error.message}
          </Alert>
        )}
        <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
          Đăng nhập
        </Button>
      </form>
      <p className="mt-5 text-sm text-ink-muted">
        Chưa có tài khoản?{' '}
        <Link className="font-semibold text-accent" to="/register">
          Đăng ký ngay
        </Link>
      </p>
      <Link className="mt-4 inline-block text-sm text-accent underline" to="/forgot-password">
        Quên mật khẩu?
      </Link>
      {health.data?.demoMode && (
        <p className="mt-4 text-sm">
          <Link className="text-ink-muted underline" to="/demo-login">
            Đăng nhập mẫu
          </Link>
        </p>
      )}
    </Card>
  );
}
