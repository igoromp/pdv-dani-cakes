import { useEffect, useState } from 'react'
import { MenuItem, UnitType, UNIT_TYPE_LABELS, formatPriceLabel } from '../types'
import { CloseIcon } from '../components/icons'

interface Form {
  name: string
  price: string
  unit_type: UnitType
  pack_size: string
}

const EMPTY_FORM: Form = { name: '', price: '', unit_type: 'unit', pack_size: '25' }

export default function Menu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [search, setSearch] = useState('')

  const load = async () => {
    setItems(await window.api.menu.list())
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const openEdit = (item: MenuItem) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      price: item.price.toFixed(2),
      unit_type: item.unit_type,
      pack_size: item.pack_size ? String(item.pack_size) : '25'
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
      unit_type: form.unit_type,
      pack_size: form.unit_type === 'pack' ? parseInt(form.pack_size, 10) || 1 : undefined
    }
    if (editingId !== null) {
      await window.api.menu.update(editingId, data)
    } else {
      await window.api.menu.create(data)
    }
    setShowForm(false)
    load()
  }

  const handleDelete = async (id: number) => {
    await window.api.menu.delete(id)
    load()
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">Cardápio dos Bolos</h1>
          <input
            type="text"
            placeholder="Buscar..."
            aria-label="Buscar item do cardápio"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2.5 min-h-[44px] border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            onClick={openNew}
            className="ml-auto px-4 py-2.5 min-h-[44px] bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors cursor-pointer"
          >
            + Novo Item
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-20">
              {search ? 'Nenhum item encontrado' : 'Nenhum item cadastrado ainda'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2"
                >
                  <div className="text-sm font-medium text-gray-800 leading-tight">{item.name}</div>
                  <div className="text-lg font-bold text-rose-600">
                    {formatPriceLabel(item.price, item.unit_type, item.pack_size)}
                  </div>
                  <div className="flex gap-1 mt-1 -ml-2">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium px-2 py-1.5 rounded-lg cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{editingId ? 'Editar Item' : 'Novo Item'}</h2>
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
                placeholder="Nome do bolo"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
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
                  <p className="text-xs text-gray-400 mt-1">O valor acima é o preço do pacote inteiro.</p>
                </div>
              )}
              {form.unit_type === 'kg' && (
                <p className="text-xs text-gray-400 mt-1">O valor acima é o preço por quilo.</p>
              )}
            </div>

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
