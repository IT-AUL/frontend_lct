import type { IntakeFile, IntakeKind } from '@/entities/assistant'
import { FILE_KIND_LABEL, FILE_KIND_OPTIONS, Icon, X } from '@/shared/ui'
import type { PendingFile } from '@/widgets/intake-board'
import styles from './IntakePage.module.css'

interface FileRowsProps {
  files: readonly IntakeFile[]
  pending: readonly PendingFile[]
  onKind: (name: string, kind: IntakeKind) => void
  onRemove: (name: string) => void
}

export function FileRows({ files, pending, onKind, onRemove }: FileRowsProps) {
  const known = new Set(files.map((file) => file.name))
  return (
    <ul className={styles.files} aria-label="Файлы">
      {files.map((file) => (
        <li key={file.name} className={styles.file} data-broken={!file.accepted || undefined}>
          <span className={styles.fileName} title={file.name}>
            {file.name}
          </span>
          {file.accepted ? (
            <select
              className={styles.kind}
              value={file.kind}
              aria-label={`Что это за файл: ${file.name}`}
              onChange={(event) => onKind(file.name, event.target.value as IntakeKind)}
            >
              {FILE_KIND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {FILE_KIND_LABEL[option]}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.fileError}>{file.reason ?? 'Не читаю такой формат'}</span>
          )}
          <button type="button" className={styles.remove} onClick={() => onRemove(file.name)} aria-label={`Убрать ${file.name}`}>
            <Icon as={X} size={14} />
          </button>
        </li>
      ))}
      {pending
        .filter((file) => !known.has(file.name))
        .map((file) => (
          <li key={file.name} className={styles.file} aria-busy="true">
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.filePending}>загружаю</span>
          </li>
        ))}
    </ul>
  )
}
