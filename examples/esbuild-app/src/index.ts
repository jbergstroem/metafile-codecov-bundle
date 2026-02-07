import { groupBy, sortBy } from "lodash-es";

interface Item {
	name: string;
	category: string;
	price: number;
}

const items: Item[] = [
	{ name: "Apple", category: "fruit", price: 1.2 },
	{ name: "Banana", category: "fruit", price: 0.5 },
	{ name: "Carrot", category: "vegetable", price: 0.8 },
	{ name: "Broccoli", category: "vegetable", price: 1.5 },
];

const grouped = groupBy(items, "category");
const sorted = sortBy(items, "price");

console.log("Grouped:", grouped);
console.log("Sorted:", sorted);
