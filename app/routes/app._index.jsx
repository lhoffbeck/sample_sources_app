/* eslint-disable react/prop-types -- prototype with dynamic GraphQL shapes, no prop-types. */
import { useEffect, useRef } from "react";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Number of products we pull from the shop to seed a new source's manual
// inclusion selections.
const PRODUCTS_PER_SOURCE = 5;
const DEFAULT_SOURCE_TITLE = "Sample source";
const DEFAULT_SOURCE_DESCRIPTION = "Created by the sample collection sources app";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // We need our own app id to scope the collectionConditionsSources query.
  // (collectionConditionsSourcesByApp would be the fallback if we couldn't
  // determine it, but currentAppInstallation gives it to us directly.)
  const appIdResponse = await admin.graphql(
    `#graphql
      query CollectionSourcesAppId {
        currentAppInstallation {
          app {
            id
          }
        }
      }`,
  );
  const appId = (await appIdResponse.json()).data.currentAppInstallation.app.id;

  const sourcesResponse = await admin.graphql(
    `#graphql
      query CollectionConditionsSources($appId: ID!) {
        collectionConditionsSources(appId: $appId, first: 50) {
          nodes {
            id
            title
            description
            inclusion {
              selections(first: 50) {
                nodes {
                  product {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }`,
    { variables: { appId } },
  );
  const sources = (await sourcesResponse.json()).data.collectionConditionsSources
    .nodes;

  return { sources };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    // Seed the source with the first few products in the shop as manual
    // inclusion selections.
    const productsResponse = await admin.graphql(
      `#graphql
        query CollectionSourceSeedProducts($first: Int!) {
          products(first: $first) {
            nodes {
              id
            }
          }
        }`,
      { variables: { first: PRODUCTS_PER_SOURCE } },
    );
    const products = (await productsResponse.json()).data.products.nodes;
    const selections = products.map((product) => ({ productId: product.id }));

    const response = await admin.graphql(
      `#graphql
        mutation CreateCollectionConditionsSource(
          $input: CollectionCreateConditionsSourceInput!
        ) {
          collectionConditionsSourceCreate(input: $input) {
            source {
              id
              title
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          input: {
            title: DEFAULT_SOURCE_TITLE,
            description: DEFAULT_SOURCE_DESCRIPTION,
            inclusion: { selections },
          },
        },
      },
    );
    const result = (await response.json()).data
      .collectionConditionsSourceCreate;

    return {
      intent,
      userErrors: result.userErrors,
      source: result.source,
      seededProductCount: selections.length,
    };
  }

  if (intent === "update") {
    const id = formData.get("id");
    const title = formData.get("title");
    const description = formData.get("description");

    const response = await admin.graphql(
      `#graphql
        mutation UpdateCollectionConditionsSource(
          $input: CollectionUpdateConditionsSourceInput!
        ) {
          collectionConditionsSourceUpdate(input: $input) {
            source {
              id
              title
              description
            }
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { input: { id, title, description } } },
    );
    const result = (await response.json()).data
      .collectionConditionsSourceUpdate;

    return { intent, userErrors: result.userErrors, source: result.source };
  }

  if (intent === "delete") {
    const id = formData.get("id");

    const response = await admin.graphql(
      `#graphql
        mutation DeleteCollectionConditionsSource($id: ID!) {
          collectionConditionsSourceDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { id } },
    );
    const result = (await response.json()).data
      .collectionConditionsSourceDelete;

    return {
      intent,
      userErrors: result.userErrors,
      deletedId: result.deletedId,
    };
  }

  return null;
};

function SourceRow({ source, submit, busy }) {
  const titleRef = useRef(null);
  const descriptionRef = useRef(null);

  const save = () =>
    submit(
      {
        intent: "update",
        id: source.id,
        title: titleRef.current.value,
        description: descriptionRef.current.value,
      },
      { method: "post" },
    );

  const remove = () =>
    submit({ intent: "delete", id: source.id }, { method: "post" });

  // Products that make up this source's manual inclusion selections.
  const products = (source.inclusion?.selections?.nodes ?? [])
    .map((selection) => selection.product)
    .filter(Boolean);

  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      borderColor="subdued"
    >
      <s-stack direction="block" gap="base">
        <s-text tone="subdued">{source.id}</s-text>
        <s-text-field ref={titleRef} label="Title" value={source.title} />
        <s-text-field
          ref={descriptionRef}
          label="Description"
          value={source.description ?? ""}
        />
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">Selections ({products.length})</s-text>
          {products.length === 0 ? (
            <s-text tone="subdued">No product selections.</s-text>
          ) : (
            <s-unordered-list>
              {products.map((product) => (
                <s-list-item key={product.id}>{product.title}</s-list-item>
              ))}
            </s-unordered-list>
          )}
        </s-stack>
        <s-stack direction="inline" gap="base">
          <s-button onClick={save} {...(busy ? { loading: true } : {})}>
            Save
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={remove}
            {...(busy ? { loading: true } : {})}
          >
            Delete
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function Index() {
  const { sources } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const busy = navigation.state === "submitting";
  const creating = busy && navigation.formData?.get("intent") === "create";

  const createSource = () => submit({ intent: "create" }, { method: "post" });

  useEffect(() => {
    if (!actionData) return;
    const errors = actionData.userErrors ?? [];
    if (errors.length > 0) return;

    if (actionData.intent === "create") {
      shopify.toast.show(
        `Source created with ${actionData.seededProductCount} products`,
      );
    } else if (actionData.intent === "update") {
      shopify.toast.show("Source updated");
    } else if (actionData.intent === "delete") {
      shopify.toast.show("Source deleted");
    }
  }, [actionData, shopify]);

  const userErrors = actionData?.userErrors ?? [];

  return (
    <s-page heading="Collection sources">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={createSource}
        {...(creating ? { loading: true } : {})}
      >
        Create collection source
      </s-button>

      {userErrors.length > 0 && (
        <s-banner tone="critical" heading="Something went wrong">
          <s-unordered-list>
            {userErrors.map((error, index) => (
              <s-list-item key={index}>{error.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section heading="Sources created by this app">
        <s-paragraph>
          Each source is created with the first {PRODUCTS_PER_SOURCE} products
          in the shop set as manual inclusion selections. Rename a source or
          delete it below.
        </s-paragraph>

        {sources.length === 0 ? (
          <s-paragraph>
            <s-text tone="subdued">
              No sources yet. Use “Create collection source” to add one.
            </s-text>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                submit={submit}
                busy={busy}
              />
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
