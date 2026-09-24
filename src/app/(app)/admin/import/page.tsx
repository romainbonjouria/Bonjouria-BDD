import ImportForm from "./import-form";

export default function ImportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Import CSV</h1>
        <p className="mt-1 text-sm text-slate-600">
          Séparateur <code>;</code> ou <code>,</code> détecté automatiquement, encodage UTF-8 ou Windows (Excel).
          Si l’email existe déjà, la fiche est <strong>mise à jour</strong> (les cellules vides n’effacent rien) ; sinon elle est créée.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
