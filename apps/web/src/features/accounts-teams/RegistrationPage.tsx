import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  CompleteRegistrationRequest,
  RegistrationEmailRequest,
  REGISTRATION_CODE_TTL_SECONDS,
} from '@arena/contracts';
import { Input, Button } from '@arena/ui';
import { api, ApiError } from '../../lib/api';

const STORAGE = 'arena-registration-countdown';
type Challenge = { email: string; deadline: number };
type CodeResponse = { expiresAt: string; serverTime: string };
function restore(): Challenge | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null') as Challenge | null;
    return data && typeof data.email === 'string' && Number.isFinite(data.deadline) ? data : null;
  } catch {
    return null;
  }
}
function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <Input label={label} error={error} {...props} />;
}
export function RegistrationPage() {
  const nav = useNavigate();
  const [challenge, setChallenge] = useState<Challenge | null>(restore);
  const [email, setEmail] = useState(() => restore()?.email ?? '');
  const [now, setNow] = useState(Date.now);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const options = useQuery({
    queryKey: ['auth-options'],
    queryFn: () => api<{ emailDomains: string[] }>('/auth/options'),
  });
  const normalizedEmail = email.trim().toLowerCase();
  const matches = challenge?.email === normalizedEmail;
  const seconds = matches ? Math.max(0, Math.ceil((challenge!.deadline - now) / 1000)) : 0;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      if (challenge) sessionStorage.setItem(STORAGE, JSON.stringify(challenge));
      else sessionStorage.removeItem(STORAGE);
    } catch {
      /* Countdown still works when storage is unavailable. */
    }
  }, [challenge]);
  function begin(result: CodeResponse, email: string) {
    const time = Date.now();
    setNow(time);
    setChallenge({
      email,
      deadline: time + Math.max(0, Date.parse(result.expiresAt) - Date.parse(result.serverTime)),
    });
    setCode('');
  }
  const send = useMutation({
    mutationFn: (email: string) =>
      api<CodeResponse>('/auth/registration-code', { method: 'POST', json: { email } }),
    onSuccess: (result, email) => {
      begin(result, email);
      setErrors({});
    },
    onError: (error, _email) => {
      if (
        error instanceof ApiError &&
        error.code === 'RATE_LIMITED' &&
        error.details &&
        typeof error.details === 'object'
      ) {
        const detail = error.details as Partial<CodeResponse>;
        if (detail.expiresAt && detail.serverTime) begin(detail as CodeResponse, _email);
      }
    },
  });
  const register = useMutation({
    mutationFn: (values: CompleteRegistrationRequest) =>
      api<{ accountId: string }>('/auth/register', { method: 'POST', json: values }),
    onSuccess: (_data, values) => {
      try {
        sessionStorage.removeItem(STORAGE);
      } catch {
        /* Registration also works with storage disabled. */
      }
      nav('/login?registered=1', { replace: true, state: { email: values.email } });
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
  function requestCode() {
    send.reset();
    register.reset();
    const parsed = RegistrationEmailRequest.safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? 'Email không hợp lệ.' });
      return;
    }
    const domains = options.data?.emailDomains ?? ['vnu.edu.vn'];
    if (!domains.includes(parsed.data.email.split('@')[1]!)) {
      setErrors({ email: `Chỉ chấp nhận email ${domains.map((d) => '@' + d).join(', ')}.` });
      return;
    }
    setErrors({});
    send.mutate(parsed.data.email);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.reset();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = CompleteRegistrationRequest.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    if (!matches || seconds === 0) {
      setErrors({ verificationCode: 'Mã đã hết hạn hoặc chưa được gửi. Vui lòng gửi mã xác minh.' });
      return;
    }
    setErrors({});
    register.mutate(parsed.data);
  }
  return (
    <section className="registration-panel ui-card">
      <div className="registration-content">
        <h1 className="mb-4 text-[36px] font-extrabold leading-tight tracking-[-0.5px]">Tạo tài khoản</h1>
        <p className="mb-6 text-sm text-ink-muted">
          Hoàn thiện thông tin và xác minh email trường để kết nối với đội của bạn.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="Họ tên"
            name="fullName"
            autoComplete="name"
            required
            maxLength={120}
            error={errors.fullName}
          />
          <Field
            label="Email trường"
            name="email"
            type="email"
            placeholder="mssv@vnu.edu.vn"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              send.reset();
              register.reset();
              setErrors({});
            }}
            required
            maxLength={254}
            error={errors.email}
          />
          <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:gap-5">
            <Field label="Lớp" name="className" required maxLength={100} error={errors.className} />
            <Field label="Khoa" name="faculty" required maxLength={150} error={errors.faculty} />
          </div>
          <Field
            label="Mật khẩu (≥ 8 ký tự)"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            error={errors.password}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={requestCode}
              disabled={send.isPending || register.isPending || seconds > 0}
              variant="secondary"
              loading={send.isPending}
            >
              {send.isPending ? 'Đang gửi mã…' : matches ? 'Gửi lại mã' : 'Gửi mã xác minh'}
            </Button>
            {matches && (
              <p role="status" className="text-sm text-ink-muted">
                {seconds > 0 ? `Mã còn hiệu lực: ${seconds} giây` : 'Mã đã hết hạn. Vui lòng gửi lại mã.'}
              </p>
            )}
          </div>
          {send.error && (
            <p role="alert" className="text-sm text-danger">
              {send.error.message}
            </p>
          )}
          <Field
            label="Mã xác minh email"
            name="verificationCode"
            placeholder="Nhập mã 6 chữ số"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            error={errors.verificationCode}
          />
          {register.error && (
            <p role="alert" className="text-sm text-danger">
              {register.error.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={!matches || seconds === 0 || code.length !== 6 || register.isPending || send.isPending}
            loading={register.isPending}
          >
            {register.isPending ? 'Đang đăng ký…' : 'Đăng ký'}
          </Button>
        </form>
        <p className="mt-4 text-xs text-ink-muted">
          MSSV được lấy tự động từ email trường. Mã xác minh có hiệu lực {REGISTRATION_CODE_TTL_SECONDS} giây.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Đã có tài khoản?{' '}
          <Link className="font-semibold text-accent underline" to="/login">
            Đăng nhập
          </Link>
        </p>
      </div>
    </section>
  );
}
