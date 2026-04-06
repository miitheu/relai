import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { optionsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('admin-create-user')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return optionsResponse()
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) {
      return errorResponse('Unauthorized', 401)
    }

    // Check admin role using service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
      .single()

    if (!roleData) {
      return errorResponse('Forbidden: admin role required', 403)
    }

    const body = await req.json()
    const { action } = body

    if (action === 'create_user') {
      const { email, password, full_name, team, role } = body

      if (!email || !password || !full_name) {
        return errorResponse('email, password, and full_name are required', 400)
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })

      if (createError) {
        logger.error('User creation failed', { error: createError.message })
        return errorResponse(createError.message, 400)
      }

      const userId = newUser.user!.id

      // Update team if provided
      if (team) {
        await adminClient.from('profiles').update({ team }).eq('user_id', userId)
      }

      // Update role if not default sales_rep
      if (role && role !== 'sales_rep') {
        await adminClient.from('user_roles').update({ role }).eq('user_id', userId)
      }

      // Audit log
      await adminClient.from('admin_audit_log').insert({
        action: 'user_created',
        entity_type: 'user',
        entity_id: userId,
        details: { email, full_name, team, role: role || 'sales_rep' },
        performed_by: caller.id
      })

      return jsonResponse({ user: newUser.user })
    }

    if (action === 'toggle_user_status') {
      const { user_id, is_active } = body

      if (!user_id) {
        return errorResponse('user_id is required', 400)
      }

      // Ban or unban via auth admin API
      if (!is_active) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: '876000h' })
      } else {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
      }

      // Update profile
      await adminClient.from('profiles').update({ is_active }).eq('user_id', user_id)

      // Audit log
      await adminClient.from('admin_audit_log').insert({
        action: is_active ? 'user_activated' : 'user_deactivated',
        entity_type: 'user',
        entity_id: user_id,
        details: { is_active },
        performed_by: caller.id
      })

      return jsonResponse({ success: true })
    }

    return errorResponse('Unknown action', 400)
  } catch (err) {
    logger.error('Admin action failed', { error: (err as Error).message })
    return errorResponse('An internal error occurred', 500)
  }
})
