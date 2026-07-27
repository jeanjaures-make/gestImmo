import { Building2, MapPin } from "lucide-react";

import { EntityForm } from "@/components/entity-form";
import { Pagination } from "@/components/pagination";
import { RowActions } from "@/components/row-actions";
import {
  Card,
  CardContent,
  EmptyState,
  PageHeader,
} from "@/components/ui/kit";
import { canManage, requireSession } from "@/lib/auth";
import { readPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, type Building } from "@/lib/types";
import { createBuilding, updateBuilding } from "./actions";
import { BuildingFields } from "./fields";

export const metadata = { title: "Immeubles — ImmoOps" };

type Row = Building & { apartments: { count: number }[] };

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const supabase = await createClient();

  // Le RLS restreint déjà à l'organisation : aucun filtre applicatif ici.
  // `count: exact` accompagne la tranche demandée — c'est lui qui permet de
  // dire à l'utilisateur combien d'éléments existent au-delà de l'écran.
  const {
    data: buildings,
    error,
    count,
  } = await supabase
    .from("buildings")
    .select("*, apartments(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page.from, page.to)
    .returns<Row[]>();

  const editable = canManage(profile.role);

  return (
    <>
      <PageHeader
        title="Immeubles"
        description="Le patrimoine bâti sur lequel reposent vos logements."
      />

      {editable && (
        <div className="mb-6">
          <EntityForm
            title="Nouvel immeuble"
            triggerLabel="Nouvel immeuble"
            submitLabel="Créer l'immeuble"
            successMessage="Immeuble créé."
            action={createBuilding}
          >
            <BuildingFields />
          </EntityForm>
        </div>
      )}

      {error && (
        <EmptyState>
          Impossible de charger les immeubles : {error.message}
        </EmptyState>
      )}

      {!error && !buildings?.length && (
        <EmptyState>
          {editable
            ? "Aucun immeuble pour le moment. Créez le premier pour commencer."
            : "Aucun immeuble à afficher."}
        </EmptyState>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {buildings?.map((building) => {
          const apartmentCount = building.apartments?.[0]?.count ?? 0;

          return (
            <Card key={building.id} className="gap-0 py-0">
              <div className="flex h-32 items-center justify-center bg-muted">
                <Building2 className="size-8 text-muted-foreground" />
              </div>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-heading truncate font-semibold">
                      {building.name}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {building.address}, {building.city}
                      </span>
                    </p>
                  </div>
                  {editable && (
                    <RowActions
                      entityLabel="Immeuble"
                      editTitle={`Modifier « ${building.name} »`}
                      editAction={updateBuilding}
                      editFields={<BuildingFields building={building} />}
                      deleteTable="buildings"
                      deleteId={building.id}
                      deleteDescription={
                        apartmentCount > 0
                          ? `« ${building.name} » contient ${apartmentCount} logement(s). Les supprimer entraînera aussi leurs baux, paiements, dépenses et interventions. Cette action est irréversible.`
                          : `« ${building.name} » sera définitivement supprimé.`
                      }
                    />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {apartmentCount} logement(s)
                  </span>
                  {building.estimated_value != null && (
                    <span className="font-medium">
                      {formatCurrency(building.estimated_value)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!error && (
        <Pagination
          page={page.number}
          size={page.size}
          total={count ?? 0}
          unit="immeubles"
        />
      )}
    </>
  );
}
