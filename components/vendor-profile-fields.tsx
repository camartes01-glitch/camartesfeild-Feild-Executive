import { Field, Muted } from "@/components/ui";
import { Chip, ChipWrap } from "@/components/chips";
import { BUSINESS_SERVICES, FREELANCER_SERVICES, SERVICE_TYPE_LABEL, primaryService } from "@/lib/camartes-services";
import type { VendorKind, VendorListing } from "@/lib/types";

export function clampServices(listing: VendorListing, selected: VendorKind[]): VendorKind[] {
  const allowed = new Set(
    (listing === "freelancer"
      ? FREELANCER_SERVICES
      : listing === "business"
        ? BUSINESS_SERVICES
        : [...FREELANCER_SERVICES, ...BUSINESS_SERVICES]
    ).map((s) => s.id),
  );
  return selected.filter((id) => allowed.has(id));
}

export function VendorProfileFields({
  name,
  contact,
  phone,
  listing,
  serviceTypes,
  onName,
  onContact,
  onPhone,
  onListing,
  onServices,
}: {
  name: string;
  contact: string;
  phone: string;
  listing: VendorListing;
  serviceTypes: VendorKind[];
  onName: (v: string) => void;
  onContact: (v: string) => void;
  onPhone: (v: string) => void;
  onListing: (v: VendorListing) => void;
  onServices: (v: VendorKind[]) => void;
}) {
  function toggle(id: VendorKind) {
    onServices(serviceTypes.includes(id) ? serviceTypes.filter((s) => s !== id) : [...serviceTypes, id]);
  }

  const primary = serviceTypes.length ? SERVICE_TYPE_LABEL[primaryService(serviceTypes, listing)] : null;

  return (
    <>
      <Field label="Outlet name" value={name} onChangeText={onName} placeholder="Studio / firm / freelancer name" />
      <Field label="Contact person" value={contact} onChangeText={onContact} placeholder="Who you met" />
      <Field
        label="Contact phone"
        value={phone}
        onChangeText={onPhone}
        keyboardType="phone-pad"
        placeholder="+91 …"
      />
      <Muted>Are they a freelancer or a business?</Muted>
      <ChipWrap>
        <Chip label="Freelancer" selected={listing === "freelancer"} onPress={() => onListing("freelancer")} />
        <Chip label="Business" selected={listing === "business"} onPress={() => onListing("business")} />
        <Chip label="Both" selected={listing === "both"} onPress={() => onListing("both")} />
      </ChipWrap>
      {listing !== "business" ? <Muted>Freelancer services they offer</Muted> : null}
      {listing !== "business" ? (
        <ChipWrap>
          {FREELANCER_SERVICES.map((s) => (
            <Chip key={s.id} label={s.name} selected={serviceTypes.includes(s.id)} onPress={() => toggle(s.id)} />
          ))}
        </ChipWrap>
      ) : null}
      {listing !== "freelancer" ? <Muted>Business services they offer</Muted> : null}
      {listing !== "freelancer" ? (
        <ChipWrap>
          {BUSINESS_SERVICES.map((s) => (
            <Chip key={s.id} label={s.name} selected={serviceTypes.includes(s.id)} onPress={() => toggle(s.id)} />
          ))}
        </ChipWrap>
      ) : null}
      {primary ? (
        <Muted>Primary listing on Camartes: {primary}</Muted>
      ) : (
        <Muted>Select at least one service they actually offer.</Muted>
      )}
    </>
  );
}
