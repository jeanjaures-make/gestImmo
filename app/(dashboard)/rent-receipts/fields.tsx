"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Field, Input, NativeSelect, Textarea } from "@/components/ui/kit";
import { amountInWordsWithCurrency } from "@/lib/amount-in-words";
import { formatCurrency } from "@/lib/money";
import {
  CURRENCY_LABEL,
  PROPERTY_KIND_LABELS,
  RENT_PAYMENT_METHOD_LABELS,
  type Property,
  type RentReceipt,
  type Tenant,
} from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** « Mars 2026 » à partir d'une date ISO. Sans `Date` : pas de fuseau. */
function monthLabel(iso: string) {
  const [year, month] = iso.split("-");
  const index = Number(month) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${year}` : "";
}

/** Le dernier jour du mois d'une date ISO, en ISO. */
function endOfMonth(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

const firstOfThisMonth = () => `${today().slice(0, 7)}-01`;

/**
 * Les champs d'une quittance de loyer.
 *
 * ─── Pourquoi un composant client, là où les autres pièces s'en passent ─
 * Choisir un locataire doit remplir le reste : son nom, son téléphone, le
 * bien qu'il occupe, l'adresse de ce bien, le loyer de son bail. Attendre
 * un aller-retour serveur pour voir ces champs se peupler donnerait une
 * impression de formulaire qui traîne, et l'utilisateur aurait commencé à
 * taper par-dessus.
 *
 * Tout reste modifiable après coup : c'est ce que demande le métier — un
 * loyer proratisé, une adresse précisée pour cette quittance-là. Les
 * valeurs reprises sont des PROPOSITIONS, jamais des verrous.
 *
 * ─── Ce que le formulaire ne décide pas ────────────────────────────────
 * Le numéro, attribué par la base sous verrou. Et le total, recalculé
 * côté serveur à partir des trois postes : l'accepter d'ici permettrait
 * d'émettre une quittance dont la somme contredit son propre détail.
 */
export function RentReceiptFields({
  receipt,
  properties,
  tenants,
  defaultManagerName,
  defaultLandlordName,
  allowDraft = true,
}: {
  receipt?: RentReceipt;
  properties: Property[];
  tenants: Tenant[];
  /** Le membre connecté : c'est lui qui signe côté agence. */
  defaultManagerName?: string;
  /** La raison sociale, quand le bien ne nomme pas de bailleur tiers. */
  defaultLandlordName?: string;
  allowDraft?: boolean;
}) {
  const [tenantId, setTenantId] = useState(receipt?.tenant_id ?? "");
  const [propertyId, setPropertyId] = useState(receipt?.property_id ?? "");
  const [tenantName, setTenantName] = useState(receipt?.tenant_name ?? "");
  const [tenantPhone, setTenantPhone] = useState(receipt?.tenant_phone ?? "");
  const [propertyLabel, setPropertyLabel] = useState(receipt?.property_label ?? "");
  const [propertyAddress, setPropertyAddress] = useState(
    receipt?.property_address ?? "",
  );
  const [propertyKind, setPropertyKind] = useState(receipt?.property_kind ?? "");
  const [landlord, setLandlord] = useState(
    receipt?.landlord_name ?? defaultLandlordName ?? "",
  );

  const [rent, setRent] = useState(String(receipt?.rent_amount ?? ""));
  const [charges, setCharges] = useState(String(receipt?.charges_amount ?? ""));
  const [fees, setFees] = useState(String(receipt?.other_fees ?? ""));

  const [periodStart, setPeriodStart] = useState(
    receipt?.period_start ?? firstOfThisMonth(),
  );
  const [periodEnd, setPeriodEnd] = useState(
    receipt?.period_end ?? endOfMonth(firstOfThisMonth()),
  );
  const [periodLabel, setPeriodLabel] = useState(
    receipt?.period_label ?? monthLabel(firstOfThisMonth()),
  );

  const [words, setWords] = useState(receipt?.amount_in_words ?? "");
  const [suggested, setSuggested] = useState(receipt?.amount_in_words ?? "");

  const total =
    (Number(rent) || 0) + (Number(charges) || 0) + (Number(fees) || 0);

  /** Recompose la phrase quand un poste change, sans écraser une saisie. */
  function retotal(next: { rent?: string; charges?: string; fees?: string }) {
    const sum =
      (Number(next.rent ?? rent) || 0) +
      (Number(next.charges ?? charges) || 0) +
      (Number(next.fees ?? fees) || 0);
    const proposal = amountInWordsWithCurrency(String(sum));
    if (words === suggested) setWords(proposal);
    setSuggested(proposal);
  }

  /** Le locataire choisi renseigne tout ce qu'on sait déjà de lui. */
  function onTenantChange(id: string) {
    setTenantId(id);
    const tenant = tenants.find((t) => t.id === id);
    if (!tenant) return;

    setTenantName(tenant.full_name);
    setTenantPhone(tenant.phone);
    setRent(String(tenant.rent_amount || ""));
    setCharges(String(tenant.charges_amount || ""));
    retotal({
      rent: String(tenant.rent_amount || ""),
      charges: String(tenant.charges_amount || ""),
    });

    if (tenant.property_id) applyProperty(tenant.property_id);
  }

  function applyProperty(id: string) {
    setPropertyId(id);
    const property = properties.find((p) => p.id === id);
    if (!property) return;

    setPropertyLabel(`${property.reference} — ${property.name}`);
    setPropertyAddress(property.address);
    setPropertyKind(property.kind);
    // Le bailleur nommé sur le bien l'emporte : c'est lui qui encaisse.
    // À défaut, la raison sociale de l'entreprise reste en place.
    if (property.owner_name) setLandlord(property.owner_name);
  }

  function onPeriodStartChange(value: string) {
    setPeriodStart(value);
    const end = endOfMonth(value);
    // La fin ne suit que si elle n'a pas été fixée à la main.
    if (periodEnd === endOfMonth(periodStart)) setPeriodEnd(end);
    if (periodLabel === monthLabel(periodStart)) setPeriodLabel(monthLabel(value));
  }

  const stale = words !== suggested && suggested !== "";

  return (
    <>
      {/* ── Qui, et quoi ────────────────────────────────────────────── */}
      <Field
        label="Locataire"
        hint="Le choisir remplit le reste : bien, adresse, loyer du bail."
      >
        <NativeSelect
          name="tenant_id"
          value={tenantId}
          onChange={(event) => onTenantChange(event.target.value)}
        >
          <option value="">— Saisie libre —</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.full_name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Nom imprimé sur la quittance">
        <Input
          name="tenant_name"
          required
          maxLength={160}
          value={tenantName}
          onChange={(event) => setTenantName(event.target.value)}
          placeholder="Konan Yao"
        />
      </Field>

      <Field label="Téléphone du locataire">
        <Input
          name="tenant_phone"
          type="tel"
          maxLength={60}
          value={tenantPhone}
          onChange={(event) => setTenantPhone(event.target.value)}
        />
      </Field>

      <Field label="Bien">
        <NativeSelect
          name="property_id"
          value={propertyId}
          onChange={(event) => applyProperty(event.target.value)}
        >
          <option value="">— Saisie libre —</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.reference} — {property.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Désignation imprimée">
        <Input
          name="property_label"
          maxLength={160}
          value={propertyLabel}
          onChange={(event) => setPropertyLabel(event.target.value)}
          placeholder="APP-A3 — Appartement 3 pièces"
        />
      </Field>

      <Field label="Type de bien">
        <NativeSelect
          name="property_kind"
          value={propertyKind}
          onChange={(event) => setPropertyKind(event.target.value)}
        >
          <option value="">— Non précisé —</option>
          {Object.entries(PROPERTY_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Adresse du bien">
          <Input
            name="property_address"
            maxLength={240}
            value={propertyAddress}
            onChange={(event) => setPropertyAddress(event.target.value)}
          />
        </Field>
      </div>

      {/* ── Période ─────────────────────────────────────────────────── */}
      <Field label="Début de période">
        <Input
          name="period_start"
          type="date"
          required
          value={periodStart}
          onChange={(event) => onPeriodStartChange(event.target.value)}
        />
      </Field>

      <Field label="Fin de période">
        <Input
          name="period_end"
          type="date"
          required
          value={periodEnd}
          onChange={(event) => setPeriodEnd(event.target.value)}
        />
      </Field>

      <Field label="Période imprimée" hint="« Mars 2026 », « 1er trimestre 2026 »…">
        <Input
          name="period_label"
          maxLength={80}
          value={periodLabel}
          onChange={(event) => setPeriodLabel(event.target.value)}
        />
      </Field>

      {/* ── Montants ────────────────────────────────────────────────── */}
      <Field label={`Loyer (${CURRENCY_LABEL})`}>
        <Input
          name="rent_amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={rent}
          onChange={(event) => {
            setRent(event.target.value);
            retotal({ rent: event.target.value });
          }}
        />
      </Field>

      <Field label={`Charges (${CURRENCY_LABEL})`}>
        <Input
          name="charges_amount"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={charges}
          onChange={(event) => {
            setCharges(event.target.value);
            retotal({ charges: event.target.value });
          }}
        />
      </Field>

      <Field label={`Autres frais (${CURRENCY_LABEL})`}>
        <Input
          name="other_fees"
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={fees}
          onChange={(event) => {
            setFees(event.target.value);
            retotal({ fees: event.target.value });
          }}
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-3">
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Total encaissé :{" "}
          <strong className="tabular-nums">{formatCurrency(total)}</strong>
          <span className="ml-2 text-muted-foreground">
            — calculé par le serveur, jamais saisi.
          </span>
        </p>
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field
          label="Montant en toutes lettres"
          hint="Proposé d'après le total, et modifiable — c'est cette phrase qui s'imprime."
        >
          <Textarea
            name="amount_in_words"
            rows={2}
            value={words}
            onChange={(event) => setWords(event.target.value)}
            placeholder="Cent soixante mille francs CFA"
          />
        </Field>

        {stale && (
          <button
            type="button"
            onClick={() => setWords(suggested)}
            className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Wand2 className="size-3.5" />
            Remettre la phrase proposée : « {suggested} »
          </button>
        )}
      </div>

      {/* ── Règlement ───────────────────────────────────────────────── */}
      <Field label="Mode de règlement">
        <NativeSelect
          name="payment_method"
          defaultValue={receipt?.payment_method ?? "especes"}
        >
          {Object.entries(RENT_PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Référence du paiement" hint="N° de chèque, de virement, de dépôt.">
        <Input
          name="payment_reference"
          maxLength={120}
          defaultValue={receipt?.payment_reference}
        />
      </Field>

      <Field label="Date du paiement">
        <Input
          name="paid_on"
          type="date"
          defaultValue={receipt?.paid_on ?? today()}
        />
      </Field>

      {/* ── Signatures et émission ──────────────────────────────────── */}
      <Field label="Bailleur / propriétaire">
        <Input
          name="landlord_name"
          maxLength={160}
          value={landlord}
          onChange={(event) => setLandlord(event.target.value)}
        />
      </Field>

      <Field label="Gestionnaire" hint="Le nom qui signe côté agence.">
        <Input
          name="manager_name"
          maxLength={160}
          defaultValue={receipt?.manager_name ?? defaultManagerName ?? ""}
        />
      </Field>

      <Field label="Date d'émission">
        <Input
          name="issued_on"
          type="date"
          required
          defaultValue={receipt?.issued_on ?? today()}
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Observations">
          <Textarea
            name="notes"
            rows={2}
            maxLength={500}
            placeholder="Règlement partiel, solde attendu avant le 15."
            defaultValue={receipt?.notes}
          />
        </Field>
      </div>

      {allowDraft && (
        <Field
          label="À l'enregistrement"
          hint="Une quittance émise ne se corrige plus : elle s'annule. Un brouillon, si."
        >
          <NativeSelect name="status" defaultValue="issued">
            <option value="issued">Émettre la quittance</option>
            <option value="draft">Garder en brouillon</option>
          </NativeSelect>
        </Field>
      )}
    </>
  );
}
