import { Button, Chip, EmptyState, Table, Tabs } from "@heroui/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import SolarInboxLineDuotone from "~icons/solar/inbox-line-duotone";
import SolarTrashBinMinimalisticLineDuotone from "~icons/solar/trash-bin-minimalistic-line-duotone";

export const Route = createFileRoute("/_layout/dash/")({ component: Home });

function Home() {
  return (
    <>
      <div>
        <div className="inner min-h-lvh relative py-20 px-8 flex h-full flex-col gap-20 border-x">
          <Tabs selectedKey="overview">
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

          <div className="flex flex-col gap-6 pt-6">
            <div className="flex items-center justify-between">
              <h1 className="text-4xl">Welcome</h1>
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
                    <Table.Column>Created</Table.Column>
                    <Table.Column>Last Used</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
                        <SolarInboxLineDuotone className="size-6 text-muted" />
                        <span className="text-sm text-muted">
                          No API keys found
                        </span>
                      </EmptyState>
                    )}
                  >
                    <Table.Row>
                      <Table.Cell>Kate Moore</Table.Cell>
                      <Table.Cell>kjasdb****</Table.Cell>
                      <Table.Cell>
                        <Chip>Active</Chip>
                      </Table.Cell>
                      <Table.Cell>2023-04-01</Table.Cell>
                      <Table.Cell>2023-04-01</Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1">
                          <Button isIconOnly size="sm" variant="danger-soft">
                            <SolarTrashBinMinimalisticLineDuotone />
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
