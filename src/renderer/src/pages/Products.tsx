import { useEffect, useState } from 'react'
import { Product, Category, UnitType, UNIT_TYPE_LABELS, formatPriceLabel } from '../types'
import { CloseIcon } from '../components/icons'

interface Form {
  name: string
  price: string
  category_id: string
  active: boolean
  unit_type: UnitType
  pack_size: string
}

const EMPTY_FORM: Form = { name: '', price: '', category_id: '', active: true, unit_type: 'unit', pack_size: '25' }

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const load = async () => {
    const [prods, cats] = await Promise.all([
      window.api.products.list(),
      window.api.categories.list()
    ])
    setProducts(prods)
    setCategories(cats)
  }

  useEffect(() => { load() }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      price: p.price.toFixed(2),
      category_id: p.category_id?.toString() ?? '',
      active: p.active === 1,
      unit_type: p.unit_type,
      pack_size: p.pack_size ? String(p.pack_size) : '25'
    })
    setShowForm(true)
  }

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: form.name.trim(),
      price: parseFloat(form.price.replace(',', '.')),
      category_id: form.category_id ? parseInt(form.category_id) : undefined,
      active: form.active ? 1 : 0,
      unit_type: form.unit_type,
      pack_size: form.unit_type === 'pack' ? parseInt(form.pack_size, 10) || 1 : undefined
    }
    if (editingId !== null) {
      await window.api.products.update(editingId, data)
    } else {
      await window.api.products.create(data)
    }
    setShowForm(false)
    load()
  }

  const handleDeactivate = async (id: number) => {
    await window.api.products.delete(id)
    load()
  }

  const handleAddCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    await window.api.categories.create(name)
    setNewCategory('')
    load()
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">Produtos</h1>
          <input
            type="text"
            placeholder="Buscar..."
            aria-label="Buscar produto"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            onClick={openNew}
            className="ml-auto px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors cursor-pointer"
          >
            + Novo Produto
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Preço</th>
                <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-800">{p.name}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{p.category_name ?? '—'}</td>
                  <td className="px-6 py-3 text-sm font-semibold text-gray-800 text-right">
                    {formatPriceLabel(p.price, p.unit_type, p.pack_size)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                      ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium mr-1 px-2.5 py-2 rounded-lg cursor-pointer"
                    >
                      Editar
                    </button>
                    {p.active ? (
                      <button
                        onClick={() => handleDeactivate(p.id)}
                        className="text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-2.5 py-2 rounded-lg cursor-pointer"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => openEdit(p)}
                        className="text-sm text-gray-500 hover:text-green-700 hover:bg-green-50 px-2.5 py-2 rounded-lg cursor-pointer"
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-gray-400">
                    {search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>
            <button
              onClick={() => setShowForm(false)}
              aria-label="Fechar painel"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="Nome do produto"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
              <input
                type="number"
                required
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de venda</label>
              <select
                value={form.unit_type}
                onChange={e => setForm(f => ({ ...f, unit_type: e.target.value as UnitType }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {(['unit', 'kg', 'pack'] as UnitType[]).map(t => (
                  <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {form.unit_type === 'pack' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Unidades por pacote</label>
                  <input
                    type="number"
                    min={1}
                    value={form.pack_size}
                    onChange={e => setForm(f => ({ ...f, pack_size: e.target.value }))}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">O preço acima é o valor do pacote inteiro.</p>
                </div>
              )}
              {form.unit_type === 'kg' && (
                <p className="text-xs text-gray-400 mt-1">O preço acima é o valor por quilo.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Sem categoria</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Nova categoria..."
                  aria-label="Nome da nova categoria"
                  className="flex-1 px-2.5 py-2 min-h-[40px] border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  aria-label="Adicionar categoria"
                  className="w-10 min-h-[40px] bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold cursor-pointer"
                >+</button>
              </div>
            </div>

            {editingId !== null && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Produto ativo</span>
              </label>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
