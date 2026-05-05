import {
  Button,
  Chip,
  Calendar,
  DateField,
  DatePicker,
  EmptyState,
  FieldError,
  Input,
  InputGroup,
  Label,
  Modal,
  Spinner,
  Table,
  Tabs,
  TextField,
  toast,
} from "@heroui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import SolarInboxLineDuotone from "~icons/solar/inbox-line-duotone";
import SolarTrashBinMinimalisticLineDuotone from "~icons/solar/trash-bin-minimalistic-line-duotone";
import SolarKeyMinimalisticLineDuotone from "~icons/solar/key-minimalistic-line-duotone";
import { z } from "zod";
import { useForm } from "@tanstack/react-form-start";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";

function toCalendarDate(iso: string): CalendarDate | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new CalendarDate(y, m, d);
}

import { useAppKitAccount } from "@reown/appkit/react";
import {
  createApiKey,
  listApiKeys,
  revealApiKey,
} from "#/functions/api-key.functions.ts";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import SolarCopyLineDuotone from "~icons/solar/copy-line-duotone";
import SolarCheckReadLineDuotone from "~icons/solar/check-read-line-duotone";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";

export const Route = createFileRoute("/_layout/dash/keys")({ component: Home });

const CreateKeySchema = z.object({
  name: z.string().max(32, "Name must be at most 32 characters."),
  expiresAt: z.string(),
});

function Home() {
  const { address } = useAppKitAccount();

  const createApiKeyFn = useServerFn(createApiKey);
  const listApiKeysFn = useServerFn(listApiKeys);
  const revealApiKeyFn = useServerFn(revealApiKey);

  const { copiedId, copy } = useCopyToClipboard();

  const handleCopyKey = async (keyId: string) => {
    try {
      const { key } = await revealApiKeyFn({ data: { id: keyId } });
      if (!key) {
        toast.danger("Key not found");
        return;
      }
      copy(keyId, key);
      toast.success("API key copied to clipboard");
    } catch {
      toast.danger("Failed to copy key");
    }
  };

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys", address],
    queryFn: () => listApiKeysFn({ data: { accountAddress: address } }),
    enabled: !!address,
  });

  const form = useForm({
    defaultValues: {
      name: "",
      expiresAt: "",
    },
    validators: {
      onSubmit: CreateKeySchema,
    },
    onSubmit: async ({ value }) => {
      if (!address) return;

      try {
        const result = await createApiKeyFn({
          data: {
            name: value.name,
            expiresAt: value.expiresAt || undefined,
            accountAddress: address,
          },
        });

        toast.success(`Operation completed ${result.name}`);
      } catch (error) {
        toast.danger("Operation failed");
        console.error(error);
      }
    },
  });

  return (
    <>
      <div>
        <div className="inner min-h-lvh relative py-20 px-8 flex h-full flex-col gap-10 border-x">
          <Tabs selectedKey="keys">
            <Tabs.ListContainer className="max-w-max">
              <Tabs.List aria-label="Options">
                <Tabs.Tab
                  className="whitespace-nowrap"
                  id="overview"
                  href="/dash"
                  render={(domProps: any) => <Link {...domProps} />}
                >
                  Overview
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab
                  className="whitespace-nowrap"
                  id="programs"
                  href="/dash"
                  render={(domProps: any) => <Link {...domProps} />}
                >
                  Your Programs
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab
                  className="whitespace-nowrap"
                  id="keys"
                  href="/dash/keys"
                  render={(domProps: any) => <Link {...domProps} />}
                >
                  API Keys
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>

          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h1 className="text-4xl">Manage Your API Keys!</h1>

              <Modal>
                <Button variant="secondary">
                  <SolarKeyMinimalisticLineDuotone />
                  Create New Key
                </Button>

                <Modal.Backdrop>
                  <Modal.Container>
                    <Modal.Dialog className="sm:max-w-[360px]">
                      <Modal.CloseTrigger />
                      <Modal.Header>
                        <Modal.Heading className="text-2xl font-bold">
                          Create New Key
                        </Modal.Heading>
                      </Modal.Header>
                      <Modal.Body>
                        <form
                          id="create-key-form"
                          className="p-1 flex flex-col gap-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            form.handleSubmit();
                          }}
                        >
                          <form.Field
                            name="name"
                            children={(field) => {
                              const isInvalid =
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid;
                              return (
                                <TextField
                                  data-invalid={isInvalid}
                                  isInvalid={isInvalid}
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={field.handleChange}
                                  variant="secondary"
                                >
                                  <Label htmlFor={field.name}>
                                    Key Name (optional)
                                  </Label>
                                  <Input
                                    id={field.name}
                                    name={field.name}
                                    aria-invalid={isInvalid}
                                    placeholder="Enter key name"
                                    autoComplete="off"
                                  />
                                  {isInvalid && (
                                    <FieldError>
                                      {field.state.meta.errors[0]?.message}
                                    </FieldError>
                                  )}
                                </TextField>
                              );
                            }}
                          />

                          <form.Field
                            name="expiresAt"
                            children={(field) => {
                              const isInvalid =
                                field.state.meta.isTouched &&
                                !field.state.meta.isValid;
                              return (
                                <DatePicker
                                  className="w-full"
                                  granularity="day"
                                  isInvalid={isInvalid}
                                  minValue={today(getLocalTimeZone())}
                                  value={
                                    field.state.value
                                      ? toCalendarDate(field.state.value)
                                      : null
                                  }
                                  onChange={(date) => {
                                    field.handleChange(
                                      date ? date.toString() : "",
                                    );
                                  }}
                                >
                                  <Label>Expiration Date (optional)</Label>
                                  <DateField.Group variant="secondary">
                                    <DateField.Input>
                                      {(segment) => (
                                        <DateField.Segment segment={segment} />
                                      )}
                                    </DateField.Input>
                                    <DateField.Suffix>
                                      <DatePicker.Trigger>
                                        <DatePicker.TriggerIndicator />
                                      </DatePicker.Trigger>
                                    </DateField.Suffix>
                                  </DateField.Group>
                                  {isInvalid && (
                                    <FieldError>
                                      {field.state.meta.errors[0]?.message}
                                    </FieldError>
                                  )}
                                  <DatePicker.Popover>
                                    <Calendar aria-label="Select expiration date">
                                      <Calendar.Header>
                                        <Calendar.YearPickerTrigger>
                                          <Calendar.YearPickerTriggerHeading />
                                          <Calendar.YearPickerTriggerIndicator />
                                        </Calendar.YearPickerTrigger>
                                        <Calendar.NavButton slot="previous" />
                                        <Calendar.NavButton slot="next" />
                                      </Calendar.Header>
                                      <Calendar.Grid>
                                        <Calendar.GridHeader>
                                          {(day) => (
                                            <Calendar.HeaderCell>
                                              {day}
                                            </Calendar.HeaderCell>
                                          )}
                                        </Calendar.GridHeader>
                                        <Calendar.GridBody>
                                          {(date) => (
                                            <Calendar.Cell date={date} />
                                          )}
                                        </Calendar.GridBody>
                                      </Calendar.Grid>
                                    </Calendar>
                                  </DatePicker.Popover>
                                </DatePicker>
                              );
                            }}
                          />
                        </form>
                      </Modal.Body>
                      <Modal.Footer>
                        <Button slot="close" variant="ghost">
                          Cancel
                        </Button>
                        <form.Subscribe
                          selector={(formState) => [
                            formState.canSubmit,
                            formState.isSubmitting,
                          ]}
                        >
                          {([canSubmit, isSubmitting]) => (
                            <Button
                              form="create-key-form"
                              type="submit"
                              isDisabled={!canSubmit}
                            >
                              {isSubmitting ? "..." : "Submit"}
                            </Button>
                          )}
                        </form.Subscribe>
                      </Modal.Footer>
                    </Modal.Dialog>
                  </Modal.Container>
                </Modal.Backdrop>
              </Modal>
            </div>

            <p>
              Lorem ipsum, dolor sit amet consectetur adipisicing elit.
              Provident obcaecati consectetur, commodi id autem doloremque
              officia, harum suscipit voluptates blanditiis deserunt ratione.
              Consectetur, mollitia. Eum nostrum quod reprehenderit laudantium
              assumenda?
            </p>

            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Team members">
                  <Table.Header>
                    <Table.Column isRowHeader>Name</Table.Column>
                    <Table.Column>Key</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Expires</Table.Column>
                    <Table.Column>Created</Table.Column>
                    <Table.Column>Last Used</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body
                    items={keys}
                    renderEmptyState={() => (
                      <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                        {isLoading ? (
                          <Spinner />
                        ) : (
                          <SolarInboxLineDuotone className="size-6 text-muted" />
                        )}
                        <span className="text-sm text-muted">
                          {isLoading ? "Loading..." : "No API keys found"}
                        </span>
                      </EmptyState>
                    )}
                  >
                    {(key) => (
                      <Table.Row id={key.id}>
                        <Table.Cell>{key.name}</Table.Cell>
                        <Table.Cell>
                          <InputGroup variant="secondary">
                            <InputGroup.Input
                              disabled
                              value={`${key.keyPrefix}****`}
                            />
                            <InputGroup.Suffix className="pr-0">
                              <Button
                                isIconOnly
                                aria-label="Copy"
                                size="sm"
                                variant="ghost"
                                onPress={() => handleCopyKey(key.id)}
                              >
                                {copiedId === key.id ? (
                                  <SolarCheckReadLineDuotone className="size-4" />
                                ) : (
                                  <SolarCopyLineDuotone className="size-4" />
                                )}
                              </Button>
                            </InputGroup.Suffix>
                          </InputGroup>
                        </Table.Cell>
                        <Table.Cell>
                          <Chip>
                            {key.expiresAt &&
                            new Date(key.expiresAt) < new Date()
                              ? "Expired"
                              : "Active"}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>
                          {key.expiresAt
                            ? new Date(key.expiresAt).toLocaleDateString()
                            : "Never"}
                        </Table.Cell>
                        <Table.Cell>
                          {key.createdAt
                            ? new Date(key.createdAt).toLocaleDateString()
                            : "—"}
                        </Table.Cell>
                        <Table.Cell>
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleDateString()
                            : "—"}
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            <Button isIconOnly size="sm" variant="danger-soft">
                              <SolarTrashBinMinimalisticLineDuotone />
                            </Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </div>
      </div>

      <div className="border-y h-14">
        <div className="inner border-x"></div>
      </div>
    </>
  );
}
