export function LoadingState({ label = 'Đang tải dữ liệu', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="ui-loading" role="status" aria-label={label}>
      <p>{label}…</p>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <span className="ui-skeleton" key={i} />
        ))}
      </div>
    </div>
  );
}
