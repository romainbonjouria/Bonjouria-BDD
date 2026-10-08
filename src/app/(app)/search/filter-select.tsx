"use client";

type Props = {
  name: string;
  label: string;
  value?: string;
  options: { value: string; count: number }[];
};

/** Menu déroulant de filtre : la recherche se relance dès qu'une valeur est choisie. */
export default function FilterSelect({ name, label, value, options }: Props) {
  // La valeur choisie reste affichée même si elle n'a plus de résultat avec les autres filtres
  const list = value && !options.some((o) => o.value === value) ? [{ value, count: 0 }, ...options] : options;

  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className={`input ${value ? "border-indigo-400 bg-indigo-50" : ""}`}
        onChange={(e) => {
          // Pas de paramètre vide dans l'URL quand on choisit « Tous »
          if (!e.currentTarget.value) e.currentTarget.removeAttribute("name");
          e.currentTarget.form?.requestSubmit();
        }}
      >
        <option value="">Tous</option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value.startsWith("~") ? `contient « ${o.value.slice(1)} »` : `${o.value} (${o.count.toLocaleString("fr-FR")})`}
          </option>
        ))}
      </select>
    </div>
  );
}
