import { Field, Input } from "@/components/ui/kit";
import type { Tenant } from "@/lib/types";

export function TenantFields({ tenant }: { tenant?: Tenant }) {
  return (
    <>
      <Field label="Prénom">
        <Input
          name="firstname"
          placeholder="Awa"
          defaultValue={tenant?.firstname}
          required
        />
      </Field>
      <Field label="Nom">
        <Input
          name="lastname"
          placeholder="Diallo"
          defaultValue={tenant?.lastname}
          required
        />
      </Field>
      <Field label="Téléphone">
        <Input
          name="phone"
          placeholder="+33 6 12 34 56 78"
          defaultValue={tenant?.phone ?? ""}
        />
      </Field>
      <Field label="E-mail">
        <Input
          name="email"
          type="email"
          placeholder="awa@exemple.com"
          defaultValue={tenant?.email ?? ""}
        />
      </Field>
      <Field label="Pièce d'identité">
        <Input
          name="identity_number"
          placeholder="N° CNI / passeport"
          defaultValue={tenant?.identity_number ?? ""}
        />
      </Field>
    </>
  );
}
