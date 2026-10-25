import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Input, Icon } from '@arena/ui';
import type { SessionUser } from '@arena/contracts';
import { destinations, matchesSearch } from '../lib/workspace-navigation';
export function CommandMenu({
  open,
  onOpenChange,
  user,
  demo,
  returnRef,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  user: SessionUser | null;
  demo: boolean;
  returnRef: RefObject<HTMLButtonElement>;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const results = useMemo(
    () =>
      destinations(user?.role ?? null, demo).filter((item) =>
        matchesSearch(`${item.label} ${item.group} ${item.keywords}`, query),
      ),
    [user?.role, demo, query],
  );
  function close() {
    onOpenChange(false);
    requestAnimationFrame(() => returnRef.current?.focus());
  }
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
    }
  }, [open]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (!open && document.querySelector('[role="dialog"][data-state="open"]')) return;
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (open) document.getElementById(`command-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, selected]);
  function go(index: number) {
    const item = results[index];
    if (!item) return;
    navigate(item.href);
    close();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
        else onOpenChange(true);
      }}
      title="Bạn muốn đi đâu?"
      description="Tìm trang, chức năng hoặc hướng dẫn. Dùng phím mũi tên và Enter để mở."
      className="command-menu"
    >
      <Input
        label="Tìm nhanh trong Bot Arena"
        hideLabel
        placeholder="Ví dụ: nộp bot, phòng đấu, hồ sơ…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        role="combobox"
        aria-expanded="true"
        aria-controls="command-results"
        aria-activedescendant={results[selected] ? `command-result-${selected}` : undefined}
        onKeyDown={(event) => {
          if (!results.length) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected(
              (value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
            );
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            go(selected);
          }
        }}
      />
      <div id="command-results" className="command-results" role="listbox" aria-label="Kết quả tìm nhanh">
        {results.length === 0 ? (
          <p className="command-empty">Không có trang phù hợp. Thử “bot”, “đội” hoặc “giải đấu”.</p>
        ) : (
          results.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === index}
              id={`command-result-${index}`}
              key={item.href}
              tabIndex={-1}
              onPointerMove={() => setSelected(index)}
              onClick={() => go(index)}
            >
              <span>
                <small>{item.group}</small>
                <strong>{item.label}</strong>
              </span>
              <Icon name="arrow" />
            </button>
          ))
        )}
      </div>
      <p className="command-help">
        <kbd>↑ ↓</kbd> Chọn <kbd>Enter</kbd> Mở <kbd>Esc</kbd> Đóng
      </p>
    </Dialog>
  );
}
