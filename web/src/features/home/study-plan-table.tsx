import {
  attestationText,
  type CategoryGroup,
  creditsText,
  MODULES,
} from "#web/domain/curriculum.ts";

type Props = {
  readonly groups: readonly CategoryGroup[];
  readonly totals: readonly number[];
};

const hoursCell = (hours: number): string => (hours > 0 ? `${String(hours)} ч` : "—");

/** The chart for screen readers: the same numbers as a table. */
export const StudyPlanTable = ({ groups, totals }: Props) => (
  <table className="sr-only">
    <caption>Учебный план 1 курса: контактные часы по модулям</caption>
    <thead>
      <tr>
        <th scope="col">Дисциплина</th>
        <th scope="col">Категория</th>
        <th scope="col">Кредиты за год</th>
        {MODULES.map((module) => (
          <th key={module} scope="col">
            {module} модуль
          </th>
        ))}
        <th scope="col">Аттестация</th>
      </tr>
    </thead>
    <tbody>
      {groups.flatMap((group) =>
        group.rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">{row.name}</th>
            <td>{group.category.label}</td>
            <td>{creditsText(row.credits)}</td>
            {row.noModuleHours ? (
              <td colSpan={MODULES.length}>без часов по модулям</td>
            ) : (
              row.hours.map((hours, index) => <td key={MODULES[index]}>{hoursCell(hours)}</td>)
            )}
            <td>{row.attestations.length === 0 ? "—" : attestationText(row.attestations)}</td>
          </tr>
        )),
      )}
      <tr>
        <th scope="row">Всего</th>
        <td />
        <td />
        {totals.map((total, index) => (
          <td key={MODULES[index]}>{hoursCell(total)}</td>
        ))}
        <td />
      </tr>
    </tbody>
  </table>
);
